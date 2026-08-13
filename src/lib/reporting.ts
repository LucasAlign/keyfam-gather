import { z } from "zod";

export const reportKindSchema = z.enum(["registrations", "attendance", "no-shows", "walk-ins", "hosts", "groups", "tables", "invitations", "invitation-conversion"]);
export type ReportKind = z.infer<typeof reportKindSchema>;

export type ReportRegistration = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  source: string;
  registeredAt: Date;
  group: string | null;
  table: string | null;
  party: string | null;
  checkedInAt: Date | null;
};

export type EventReportingInput = {
  registrations: ReportRegistration[];
  hosts: Array<{ firstName: string; lastName: string; email: string | null; phone: string | null; group: string }>;
  groups: Array<{ name: string; capacity: number | null; registrationIds: string[] }>;
  tables: Array<{ name: string; capacity: number; registrationIds: string[] }>;
  invitations: Array<{ firstName: string; lastName: string; email: string | null; phone: string | null; status: string; group: string | null; sender: string; sentAt: Date | null; openedAt: Date | null; respondedAt: Date | null; registered: boolean }>;
};

export type EventReporting = ReturnType<typeof buildEventReporting>;

export function buildEventReporting(input: EventReportingInput) {
  const activeIds = new Set(input.registrations.filter((registration) => registration.checkedInAt).map((registration) => registration.id));
  const registered = input.registrations.length;
  const checkedIn = activeIds.size;
  const tables = input.tables.map((table) => {
    const assigned = table.registrationIds.length;
    return { ...table, assigned, checkedIn: table.registrationIds.filter((id) => activeIds.has(id)).length, remaining: Math.max(table.capacity - assigned, 0), overBy: Math.max(assigned - table.capacity, 0) };
  });
  const groups = input.groups.map((group) => {
    const assigned = group.registrationIds.length;
    return { ...group, registered: assigned, checkedIn: group.registrationIds.filter((id) => activeIds.has(id)).length, remaining: group.capacity === null ? null : Math.max(group.capacity - assigned, 0) };
  });
  const invitationCounts = Object.fromEntries(["DRAFT", "SENT", "OPENED", "REGISTERED", "DECLINED", "CANCELLED", "NO_RESPONSE"].map((status) => [status, input.invitations.filter((invitation) => invitation.status === status).length])) as Record<string, number>;
  const delivered = input.invitations.filter((invitation) => invitation.sentAt).length;
  const opened = input.invitations.filter((invitation) => invitation.openedAt).length;
  const converted = input.invitations.filter((invitation) => invitation.registered || invitation.status === "REGISTERED").length;
  return {
    metrics: {
      registered,
      checkedIn,
      attendancePercent: registered === 0 ? 0 : Math.round((checkedIn / registered) * 100),
      notArrived: registered - checkedIn,
      walkIns: input.registrations.filter((registration) => registration.source === "WALK_IN").length,
      unassignedGuests: input.registrations.filter((registration) => !registration.table).length,
      tableIssues: tables.filter((table) => table.overBy > 0).length,
    },
    registrations: input.registrations,
    attendance: input.registrations.filter((registration) => registration.checkedInAt),
    noShows: input.registrations.filter((registration) => !registration.checkedInAt),
    walkIns: input.registrations.filter((registration) => registration.source === "WALK_IN"),
    hosts: input.hosts,
    groups,
    tables,
    invitations: input.invitations,
    invitationConversion: { total: input.invitations.length, delivered, opened, converted, counts: invitationCounts, openRate: delivered === 0 ? 0 : Math.round((opened / delivered) * 100), conversionRate: delivered === 0 ? 0 : Math.round((converted / delivered) * 100) },
  };
}

const csvCell = (value: string | number | Date | null) => {
  const raw = value instanceof Date ? value.toISOString() : value === null ? "" : String(value);
  const text = /^[=+\-@\t\r\n]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

function csv(headers: string[], rows: Array<Array<string | number | Date | null>>) {
  return `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

export function renderReportCsv(report: EventReporting, kind: ReportKind) {
  const registrationRows = (rows: ReportRegistration[]) => rows.map((item) => [item.firstName, item.lastName, item.email, item.phone, item.source.replaceAll("_", " "), item.registeredAt, item.group, item.table, item.party, item.checkedInAt ? "Checked in" : "Not arrived", item.checkedInAt]);
  switch (kind) {
    case "registrations": return csv(["First name", "Last name", "Email", "Phone", "Source", "Registered at", "Group", "Table", "Party", "Attendance", "Checked in at"], registrationRows(report.registrations));
    case "attendance": return csv(["First name", "Last name", "Email", "Phone", "Source", "Registered at", "Group", "Table", "Party", "Attendance", "Checked in at"], registrationRows(report.attendance));
    case "no-shows": return csv(["First name", "Last name", "Email", "Phone", "Source", "Registered at", "Group", "Table", "Party", "Attendance", "Checked in at"], registrationRows(report.noShows));
    case "walk-ins": return csv(["First name", "Last name", "Email", "Phone", "Source", "Registered at", "Group", "Table", "Party", "Attendance", "Checked in at"], registrationRows(report.walkIns));
    case "hosts": return csv(["First name", "Last name", "Email", "Phone", "Group"], report.hosts.map((item) => [item.firstName, item.lastName, item.email, item.phone, item.group]));
    case "groups": return csv(["Group", "Capacity", "Registered", "Checked in", "Remaining"], report.groups.map((item) => [item.name, item.capacity, item.registered, item.checkedIn, item.remaining]));
    case "tables": return csv(["Table", "Capacity", "Assigned", "Checked in", "Remaining", "Over capacity by"], report.tables.map((item) => [item.name, item.capacity, item.assigned, item.checkedIn, item.remaining, item.overBy]));
    case "invitations": return csv(["First name", "Last name", "Email", "Phone", "Status", "Group", "Sender", "Sent at", "Opened at", "Responded at", "Registered"], report.invitations.map((item) => [item.firstName, item.lastName, item.email, item.phone, item.status.replaceAll("_", " "), item.group, item.sender, item.sentAt, item.openedAt, item.respondedAt, item.registered ? "Yes" : "No"]));
    case "invitation-conversion": return csv(["Metric", "Value"], [["Total invitations", report.invitationConversion.total], ["Delivered", report.invitationConversion.delivered], ["Opened", report.invitationConversion.opened], ["Registered", report.invitationConversion.converted], ["Open rate", `${report.invitationConversion.openRate}%`], ["Conversion rate", `${report.invitationConversion.conversionRate}%`], ...Object.entries(report.invitationConversion.counts).map(([status, count]) => [`Status: ${status.replaceAll("_", " ")}`, count])]);
  }
}
