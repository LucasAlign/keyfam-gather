import type { HostGroupHealth } from "@/lib/host-health";

// ---------------------------------------------------------------------------
// #24 — Detect underfilled/at-risk Host Groups and draft a follow-up (pure).
//
// Builds on the #16 host-health scoring: it takes an already-scored HostGroupHealth
// row, folds in how close the Event is, and — for any Group that still needs
// attention — produces an editable reminder draft that carries the Host portal
// link as a placeholder. The real link is recovered and substituted at approval
// time (via #9); nothing here sends anything. When the recommendation spine (#21)
// lands, buildHostFollowup becomes the detector feeding propose(), with the draft
// as the proposedAction and the reasons as the evidence.
// ---------------------------------------------------------------------------

export type HostFollowupUrgency = "attention" | "urgent";

export type HostFollowup = {
  groupId: string;
  groupName: string;
  hostName: string;
  urgency: HostFollowupUrgency;
  // Plain-language evidence: why this Host was selected (from host-health plus
  // the days-to-Event signal).
  reasons: string[];
  daysToEvent: number | null;
  remaining: number | null;
  // The portal link is missing/expired/revoked — the reminder is moot until it
  // is recovered, so the executor must restore it before sending.
  needsPortalLink: boolean;
  // An editable reminder body carrying the portal-link placeholder.
  draftMessage: string;
};

// The link the executor substitutes with a freshly recovered Host portal URL.
export const HOST_PORTAL_LINK_PLACEHOLDER = "{{host_portal_link}}";

// Inside this window an otherwise "attention" Group is escalated to "urgent":
// there is little time left to fill seats or fix a broken link.
export const URGENT_WINDOW_DAYS = 7;

const urgencyRank: Record<HostFollowupUrgency, number> = { urgent: 0, attention: 1 };

export function buildHostFollowup(health: HostGroupHealth, daysToEvent: number | null): HostFollowup | null {
  // Only Groups host-health already flags need a follow-up.
  if (health.followUp.level === "ok") return null;

  let urgency: HostFollowupUrgency = health.followUp.level === "urgent" ? "urgent" : "attention";
  const reasons = [...health.followUp.reasons];

  if (daysToEvent !== null && daysToEvent >= 0) {
    if (daysToEvent <= URGENT_WINDOW_DAYS && urgency === "attention") urgency = "urgent";
    reasons.push(`${daysToEvent} ${daysToEvent === 1 ? "day" : "days"} until the event.`);
  }

  const needsPortalLink = health.linkStatus !== "active";
  return {
    groupId: health.groupId,
    groupName: health.groupName,
    hostName: health.hostName,
    urgency,
    reasons,
    daysToEvent,
    remaining: health.remaining,
    needsPortalLink,
    draftMessage: draftReminder(health, needsPortalLink),
  };
}

// Draft an editable reminder from the evidence. Concrete enough to send after a
// glance, generic enough that staff can trim it; the portal link is always a
// placeholder the executor fills in.
function draftReminder(health: HostGroupHealth, needsPortalLink: boolean): string {
  const lines: string[] = [`Hi ${health.hostName},`];
  const seats = health.remaining !== null && health.remaining > 0
    ? `there ${health.remaining === 1 ? "is" : "are"} still ${health.remaining} open ${health.remaining === 1 ? "seat" : "seats"} in ${health.groupName}`
    : `we'd love your help filling ${health.groupName}`;
  lines.push(`Thanks for hosting for our upcoming event — ${seats}.`);
  if (health.missingContactCount > 0) {
    lines.push(`A few guests are missing contact details (${health.missingContactCount}); adding them helps us reach everyone.`);
  }
  lines.push(needsPortalLink
    ? `Use your refreshed host portal to invite guests and manage your table: ${HOST_PORTAL_LINK_PLACEHOLDER}`
    : `You can invite guests and manage your table from your host portal: ${HOST_PORTAL_LINK_PLACEHOLDER}`);
  lines.push("Thank you!");
  return lines.join("\n\n");
}

// Sort the Groups a coordinator should chase first: urgent before attention,
// then the emptiest Groups (most open seats) ahead of nearly-full ones.
export function buildHostFollowups(rows: HostGroupHealth[], daysToEvent: number | null): HostFollowup[] {
  return rows
    .map((row) => buildHostFollowup(row, daysToEvent))
    .filter((followup): followup is HostFollowup => followup !== null)
    .sort((a, b) => urgencyRank[a.urgency] - urgencyRank[b.urgency] || (b.remaining ?? -1) - (a.remaining ?? -1) || a.groupName.localeCompare(b.groupName));
}
