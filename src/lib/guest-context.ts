// Contextual badge for a check-in row: at a glance, is this guest a Host, a
// guest a Host brought, part of a Sponsor's allotment, or an Individual who
// registered on their own? Pure so the check-in loader and tests share one
// definition of precedence.

export type GuestContext = "host" | "sponsor_guest" | "host_guest" | "individual";

export type GuestContextInput = {
  // This person hosts a Group at the event.
  isHost: boolean;
  // The Group this registrant belongs to is hosted by someone.
  groupHosted: boolean;
  // The Group this registrant belongs to is tied to a Sponsorship allotment.
  groupSponsored: boolean;
};

// Precedence, most specific first: being a Host outranks any guest role; a
// Sponsor allotment is more notable context than a general Host guest.
export function guestContext(input: GuestContextInput): GuestContext {
  if (input.isHost) return "host";
  if (input.groupSponsored) return "sponsor_guest";
  if (input.groupHosted) return "host_guest";
  return "individual";
}

export const GUEST_CONTEXT_LABELS: Record<GuestContext, string> = {
  host: "Host",
  sponsor_guest: "Sponsor guest",
  host_guest: "Host guest",
  individual: "Individual",
};
