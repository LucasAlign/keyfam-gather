// Host & Group health model (issue #16). Turns raw per-Group data into an
// actionable, sortable health row: seats filled/remaining, missing guest
// contact details, portal link status, last activity, and a derived follow-up
// need. All counts are expected to already exclude Cancelled and Superseded
// registrations (only ACTIVE ones are health-relevant).

export type HostLinkStatus = "active" | "expired" | "revoked" | "none";
export type FollowUpLevel = "ok" | "attention" | "urgent";

export interface HostGroupInput {
  groupId: string;
  groupName: string;
  hostName: string;
  capacity: number | null;
  activeRegistrations: number;
  missingContactCount: number;
  linkStatus: HostLinkStatus;
  lastActivityAt: Date | null;
}

export interface HostGroupHealth extends HostGroupInput {
  remaining: number | null;
  fillRate: number | null;
  followUp: { level: FollowUpLevel; reasons: string[] };
}

const severityRank: Record<FollowUpLevel, number> = { urgent: 0, attention: 1, ok: 2 };

export function buildHostGroupHealth(input: HostGroupInput): HostGroupHealth {
  const remaining = input.capacity === null ? null : Math.max(input.capacity - input.activeRegistrations, 0);
  const fillRate = input.capacity && input.capacity > 0 ? Math.min(input.activeRegistrations / input.capacity, 1) : null;

  const reasons: string[] = [];
  let level: FollowUpLevel = "ok";

  // A missing or dead portal link is the most urgent problem: the Host cannot
  // manage their guests at all until it's restored (integrates with #9).
  if (input.linkStatus !== "active") {
    reasons.push(input.linkStatus === "none" ? "No portal link has been created yet." : input.linkStatus === "expired" ? "The portal link has expired." : "The portal link was revoked.");
    level = "urgent";
  }
  if (input.activeRegistrations === 0) {
    reasons.push("No guests registered yet.");
    if (level !== "urgent") level = "attention";
  } else if (remaining !== null && remaining > 0) {
    reasons.push(`${remaining} ${remaining === 1 ? "seat" : "seats"} still open.`);
    if (level !== "urgent") level = "attention";
  }
  if (input.missingContactCount > 0) {
    reasons.push(`${input.missingContactCount} ${input.missingContactCount === 1 ? "guest is" : "guests are"} missing contact details.`);
    if (level !== "urgent") level = "attention";
  }
  if (input.linkStatus === "active" && input.lastActivityAt === null) {
    reasons.push("Host hasn't opened their portal yet.");
    if (level !== "urgent") level = "attention";
  }

  return { ...input, remaining, fillRate, followUp: { level, reasons } };
}

// Order by follow-up need first (urgent → attention → ok), then by the most
// open seats, so the Groups a coordinator should chase surface at the top.
export function sortByFollowUp(rows: HostGroupHealth[]): HostGroupHealth[] {
  return [...rows].sort((a, b) => {
    const bySeverity = severityRank[a.followUp.level] - severityRank[b.followUp.level];
    if (bySeverity !== 0) return bySeverity;
    const aOpen = a.remaining ?? -1;
    const bOpen = b.remaining ?? -1;
    if (aOpen !== bOpen) return bOpen - aOpen;
    return a.groupName.localeCompare(b.groupName);
  });
}

export interface HostHealthSummary {
  groups: number;
  needsFollowUp: number;
  urgent: number;
  openSeats: number;
  missingContacts: number;
}

export function summarizeHostHealth(rows: HostGroupHealth[]): HostHealthSummary {
  return {
    groups: rows.length,
    needsFollowUp: rows.filter((row) => row.followUp.level !== "ok").length,
    urgent: rows.filter((row) => row.followUp.level === "urgent").length,
    openSeats: rows.reduce((total, row) => total + (row.remaining ?? 0), 0),
    missingContacts: rows.reduce((total, row) => total + row.missingContactCount, 0),
  };
}
