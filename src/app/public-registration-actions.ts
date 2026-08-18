"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { normalizeEmail, normalizePhone } from "@/lib/normalization";
import { resolvePerson } from "@/lib/person-resolution";
import { parseRegistrationAnswers } from "@/lib/registration-fields";
import { withSerializableRetry } from "@/lib/transactions";
import { registrationSchema } from "@/lib/validation";

export type PublicRegistrationState = { error?: string; success?: string; fields?: Record<string, string[]> };
export async function registerPublic(_: PublicRegistrationState, formData: FormData): Promise<PublicRegistrationState> {
  const eventId = String(formData.get("eventId") ?? "");
  const parsed = registrationSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "Review the highlighted details.", fields: parsed.error.flatten().fieldErrors };
  try {
    const event = await db.event.findUnique({ where: { id: eventId }, include: { registrationFields: { where: { isActive: true }, include: { options: true } } } });
    const now = new Date();
    if (!event || !event.isPublic || event.status !== "REGISTRATION_OPEN" || event.registrationOpensAt && event.registrationOpensAt > now || event.registrationClosesAt && event.registrationClosesAt < now) throw new Error("Public registration is not available for this event.");
    const custom = parseRegistrationAnswers(event.registrationFields, formData, "PUBLIC");
    if (!custom.success) return { error: "Review the custom registration details.", fields: custom.errors };
    await withSerializableRetry(async (tx) => {
      const resolution = await resolvePerson(tx, event.organizationId, parsed.data);
      if (resolution.kind === "CONFLICT" || resolution.kind === "SUGGESTIONS") throw new Error("We couldn't complete this registration automatically. Please contact the event organizer.");
      const person = resolution.kind === "EXACT" ? await tx.person.findFirstOrThrow({ where: { id: resolution.personId, organizationId: event.organizationId, mergedIntoPersonId: null } }) : await tx.person.create({ data: { organizationId: event.organizationId, firstName: parsed.data.firstName, lastName: parsed.data.lastName, email: parsed.data.email || null, emailNormalized: parsed.data.email ? normalizeEmail(parsed.data.email) : null, phone: parsed.data.phone || null, phoneNormalized: parsed.data.phone ? normalizePhone(parsed.data.phone) : null } });
      const existing = await tx.registration.findUnique({ where: { eventId_personId: { eventId, personId: person.id } } });
      if (existing?.status === "ACTIVE") throw new Error("A registration already exists for these details.");
      const registration = existing && existing.status === "CANCELLED" ? await tx.registration.update({ where: { id: existing.id }, data: { status: "ACTIVE", cancelledAt: null, source: "PUBLIC" } }) : await tx.registration.create({ data: { organizationId: event.organizationId, eventId, personId: person.id, source: "PUBLIC" } });
      for (const answer of custom.answers) await tx.registrationFieldAnswer.upsert({ where: { registrationId_fieldId: { registrationId: registration.id, fieldId: answer.fieldId } }, create: { organizationId: event.organizationId, eventId, registrationId: registration.id, ...answer }, update: { value: answer.value } });
      await tx.auditLog.create({ data: { organizationId: event.organizationId, eventId, action: "registration.public_created", entityType: "Registration", entityId: registration.id, newState: JSON.stringify({ personId: person.id, exactMatch: resolution.kind === "EXACT", customAnswerCount: custom.answers.length }) } });
    });
    revalidatePath(`/events/${eventId}`); return { success: "You're registered." };
  } catch (error) { return { error: error instanceof Error ? error.message : "We couldn't complete this registration." }; }
}
