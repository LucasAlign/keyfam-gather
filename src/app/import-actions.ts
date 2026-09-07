"use server";

import { revalidatePath } from "next/cache";
import { requireActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildImportRows, type ColumnMapping, parseCsvTable } from "@/lib/csv-import";
import { normalizeEmail, normalizePhone } from "@/lib/normalization";
import { resolvePerson } from "@/lib/person-resolution";
import { withSerializableRetry } from "@/lib/transactions";

export type DuplicatePolicy = "create-new" | "reuse-closest";

export type ImportRowOutcome = { row: number; name: string; status: "created" | "reused" | "reactivated" | "skipped" | "error"; message: string };
export type ImportSummary = { created: number; reused: number; reactivated: number; skipped: number; errors: number };
export type ImportActionState = { error?: string; summary?: ImportSummary; outcomes?: ImportRowOutcome[] };

// Import People + Registrations from a mapped CSV (issue #14). Each row is
// applied in its own serializable transaction so one bad row never rolls back
// the others and every failure names its exact spreadsheet line; the unique
// (event, person) constraint makes re-running the same file idempotent.
export async function importRegistrations(_: ImportActionState, formData: FormData): Promise<ImportActionState> {
  const eventId = String(formData.get("eventId") ?? "");
  const csv = String(formData.get("csv") ?? "");
  const policy: DuplicatePolicy = formData.get("duplicatePolicy") === "reuse-closest" ? "reuse-closest" : "create-new";
  let mapping: ColumnMapping;
  try {
    mapping = JSON.parse(String(formData.get("mapping") ?? "{}")) as ColumnMapping;
  } catch {
    return { error: "The column mapping was invalid. Re-map the columns and try again." };
  }

  const event = await db.event.findUnique({ where: { id: eventId }, select: { organizationId: true } });
  if (!event) return { error: "This Event no longer exists." };
  const { user } = await requireActor(event.organizationId, "registration:manage", eventId);
  const organizationId = event.organizationId;

  const { headers, rows } = parseCsvTable(csv);
  if (headers.length === 0 || rows.length === 0) return { error: "No data rows were found in the pasted CSV." };
  const mapped = buildImportRows(rows, mapping);

  // Resolve Group/Party/Table names to ids once, case-insensitively.
  const [groups, parties, tables] = await Promise.all([
    db.group.findMany({ where: { eventId, organizationId }, select: { id: true, name: true } }),
    db.party.findMany({ where: { eventId, organizationId }, select: { id: true, name: true } }),
    db.seatingTable.findMany({ where: { eventId, organizationId }, select: { id: true, name: true } }),
  ]);
  const byName = (records: Array<{ id: string; name: string }>) => new Map(records.map((record) => [record.name.trim().toLowerCase(), record.id]));
  const groupByName = byName(groups);
  const partyByName = byName(parties);
  const tableByName = byName(tables);

  const outcomes: ImportRowOutcome[] = [];
  const summary: ImportSummary = { created: 0, reused: 0, reactivated: 0, skipped: 0, errors: 0 };

  for (const entry of mapped) {
    // Report against the spreadsheet line: +2 accounts for the header row.
    const rowNumber = entry.index + 2;
    const name = [entry.values.firstName, entry.values.lastName].filter(Boolean).join(" ") || "(unnamed)";
    const fail = (message: string) => { summary.errors += 1; outcomes.push({ row: rowNumber, name, status: "error", message }); };

    if (entry.errors.length) { fail(entry.errors.join(" ")); continue; }
    if (entry.duplicateInFile) { summary.skipped += 1; outcomes.push({ row: rowNumber, name, status: "skipped", message: "Duplicate of an earlier row in this file." }); continue; }

    const assignment: { groupId?: string; partyId?: string; tableId?: string } = {};
    const lookup = (label: string, value: string, map: Map<string, string>, key: "groupId" | "partyId" | "tableId") => {
      if (!value) return true;
      const id = map.get(value.trim().toLowerCase());
      if (!id) { fail(`${label} "${value}" does not exist for this Event.`); return false; }
      assignment[key] = id;
      return true;
    };
    if (!lookup("Group", entry.values.group, groupByName, "groupId")) continue;
    if (!lookup("Party", entry.values.party, partyByName, "partyId")) continue;
    if (!lookup("Table", entry.values.table, tableByName, "tableId")) continue;

    try {
      const outcome = await withSerializableRetry(async (tx) => {
        const resolution = await resolvePerson(tx, organizationId, entry.values);
        if (resolution.kind === "CONFLICT") throw new Error("Email and phone identify different existing People; resolve them manually.");
        let personId = resolution.kind === "EXACT" ? resolution.personId : null;
        if (resolution.kind === "SUGGESTIONS" && policy === "reuse-closest") personId = resolution.personIds[0];
        const reusedExisting = personId !== null;

        const person = personId
          ? await tx.person.findFirstOrThrow({ where: { id: personId, organizationId, mergedIntoPersonId: null } })
          : await tx.person.create({ data: {
              organizationId,
              firstName: entry.values.firstName,
              lastName: entry.values.lastName,
              email: entry.values.email || null,
              emailNormalized: entry.values.email ? normalizeEmail(entry.values.email) : null,
              phone: entry.values.phone || null,
              phoneNormalized: entry.values.phone ? normalizePhone(entry.values.phone) : null,
            } });

        const existing = await tx.registration.findUnique({ where: { eventId_personId: { eventId, personId: person.id } } });
        if (existing?.status === "ACTIVE") return { status: "skipped" as const, message: "Already registered for this Event." };
        const registration = existing
          ? await tx.registration.update({ where: { id: existing.id }, data: { status: "ACTIVE", cancelledAt: null, supersededAt: null, supersededByRegistrationId: null, source: "STAFF", ...assignment } })
          : await tx.registration.create({ data: { organizationId, eventId, personId: person.id, source: "STAFF", ...assignment } });
        await tx.auditLog.create({ data: { organizationId, eventId, actorId: user.id, action: existing ? "registration.imported_reactivated" : "registration.imported", entityType: "Registration", entityId: registration.id, newState: JSON.stringify({ personId: person.id, personReused: reusedExisting, assignment, row: rowNumber }) } });
        if (existing) return { status: "reactivated" as const, message: "Re-activated a cancelled registration." };
        return { status: reusedExisting ? ("reused" as const) : ("created" as const), message: reusedExisting ? "Matched an existing Person." : "Created a new Person and registration." };
      });
      summary[outcome.status] += 1;
      outcomes.push({ row: rowNumber, name, status: outcome.status, message: outcome.message });
    } catch (error) {
      fail(error instanceof Error ? error.message : "Could not import this row.");
    }
  }

  // One batch-level audit record so the import itself is traceable, not only the
  // per-row registration entries.
  await db.auditLog.create({ data: { organizationId, eventId, actorId: user.id, action: "registration.import_batch", entityType: "Event", entityId: eventId, newState: JSON.stringify({ policy, ...summary }) } });
  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/events/${eventId}/registrations`);
  return { summary, outcomes };
}
