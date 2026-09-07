import type { DeliveryChannel, MessageCategory } from "@prisma/client";

// Event communications engine (issue #17): compute segmented audiences from
// event state, render reusable templates, and respect opt-out — all as pure,
// testable functions shared by the compose preview and the send action.

export type SegmentId =
  | "active_registrations"
  | "checked_in"
  | "no_shows"
  | "hosts"
  | "underfilled_group_hosts"
  | "invited_no_response"
  | "sponsors";

export const SEGMENTS: Array<{ id: SegmentId; label: string; description: string }> = [
  { id: "active_registrations", label: "Active registrations", description: "Everyone with an active registration." },
  { id: "checked_in", label: "Checked-in guests", description: "Guests who have been checked in." },
  { id: "no_shows", label: "No-shows", description: "Registered guests who never checked in." },
  { id: "hosts", label: "Hosts", description: "All hosts for this event." },
  { id: "underfilled_group_hosts", label: "Hosts of underfilled Groups", description: "Hosts whose Group still has open seats." },
  { id: "invited_no_response", label: "Invited, no response", description: "Invitees who haven't responded yet." },
  { id: "sponsors", label: "Sponsor contacts", description: "Primary contacts for sponsors." },
];

export const MESSAGE_CATEGORIES: Array<{ id: MessageCategory; label: string }> = [
  { id: "INVITATION", label: "Invitation" },
  { id: "CONFIRMATION", label: "Confirmation" },
  { id: "REMINDER", label: "Reminder" },
  { id: "LOGISTICS", label: "Logistics" },
  { id: "THANK_YOU", label: "Thank-you" },
  { id: "NO_SHOW", label: "No-show follow-up" },
];

export type AudienceCandidate = {
  personId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  optOut: boolean;
  isRegistered: boolean;
  isCheckedIn: boolean;
  isHost: boolean;
  isUnderfilledGroupHost: boolean;
  invitationPending: boolean; // invited but not yet responded (SENT/OPENED/NO_RESPONSE)
  isSponsorContact: boolean;
};

export function matchesSegment(candidate: AudienceCandidate, segment: SegmentId): boolean {
  switch (segment) {
    case "active_registrations": return candidate.isRegistered;
    case "checked_in": return candidate.isCheckedIn;
    case "no_shows": return candidate.isRegistered && !candidate.isCheckedIn;
    case "hosts": return candidate.isHost;
    case "underfilled_group_hosts": return candidate.isUnderfilledGroupHost;
    case "invited_no_response": return candidate.invitationPending;
    case "sponsors": return candidate.isSponsorContact;
    default: return false;
  }
}

export function contactForChannel(candidate: AudienceCandidate, channel: DeliveryChannel): string | null {
  return channel === "EMAIL" ? candidate.email : candidate.phone;
}

export type AudienceRecipient = { personId: string; firstName: string; lastName: string; recipient: string };
export type AudienceResult = {
  recipients: AudienceRecipient[];
  optedOut: number;    // in segment, reachable, but opted out
  unreachable: number; // in segment, not opted out, but no contact for this channel
};

// Deliverable recipients for a segment on a channel, plus the excluded counts
// so a coordinator can see exactly who is skipped and why before sending.
export function buildAudience(candidates: AudienceCandidate[], segment: SegmentId, channel: DeliveryChannel): AudienceResult {
  const recipients: AudienceRecipient[] = [];
  const seen = new Set<string>();
  let optedOut = 0;
  let unreachable = 0;
  for (const candidate of candidates) {
    if (!matchesSegment(candidate, segment)) continue;
    if (candidate.optOut) { optedOut += 1; continue; }
    const contact = contactForChannel(candidate, channel);
    if (!contact) { unreachable += 1; continue; }
    if (seen.has(candidate.personId)) continue;
    seen.add(candidate.personId);
    recipients.push({ personId: candidate.personId, firstName: candidate.firstName, lastName: candidate.lastName, recipient: contact });
  }
  return { recipients, optedOut, unreachable };
}

export const TEMPLATE_PLACEHOLDERS = ["firstName", "lastName", "eventName", "eventDate", "venue"] as const;
export type TemplateVars = Partial<Record<(typeof TEMPLATE_PLACEHOLDERS)[number], string>>;

// Replace {{placeholder}} tokens; unknown or missing values render as empty so
// a stray token never leaks braces into a delivered message.
export function renderTemplate(text: string, vars: TemplateVars): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) => vars[key as keyof TemplateVars] ?? "");
}
