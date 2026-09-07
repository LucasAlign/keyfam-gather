import { formatMoney } from "@/lib/fundraising";

// ---------------------------------------------------------------------------
// Next-year Event rollover assistant (pure).
//
// A rollover copies an Event's *configuration* into a fresh draft while leaving
// every record of participation behind (People, Hosts, Registrations, Invitations,
// attendance stay attached to the prior Event and are never silently re-registered).
// What staff get instead is a preview of what will be copied plus evidence-backed
// recommendations — returning Hosts, Sponsors, and prior audiences — that they can
// select to seed renewal outreach. Nothing here decides anything on its own: every
// function produces candidates with the evidence behind them, and selection +
// approval happen in the action layer.
// ---------------------------------------------------------------------------

export type ReusableConfiguration = {
  groups: number;
  seatingTables: number;
  registrationFields: number;
};

export type ConfigurationPreviewItem = { label: string; detail: string; count: number };

// A flat, human-readable preview of exactly what a rollover copies. Anything a
// rollover does NOT copy is called out too, so staff can see the boundary rather
// than assume last year's guests come along.
export function summarizeReusableConfiguration(config: ReusableConfiguration): ConfigurationPreviewItem[] {
  return [
    { label: "Groups", count: config.groups, detail: config.groups ? `${config.groups} group${plural(config.groups)} copied as empty containers` : "No groups to copy" },
    { label: "Seating tables", count: config.seatingTables, detail: config.seatingTables ? `${config.seatingTables} table${plural(config.seatingTables)} copied with capacity, no seats filled` : "No seating tables to copy" },
    { label: "Registration fields", count: config.registrationFields, detail: config.registrationFields ? `${config.registrationFields} custom field${plural(config.registrationFields)} copied` : "No custom registration fields to copy" },
  ];
}

// Participation categories that a rollover deliberately leaves in the past. Surfaced
// in the UI so the "never silently registered" guarantee is visible, not implied.
export const PRESERVED_HISTORY = [
  "Registrations and attendance stay on the prior Event.",
  "Hosts, Invitations, and Parties are not copied — you choose who to invite again.",
  "Fundraising commitments, payments, and sponsorships remain historical records.",
] as const;

export type RolloverRecommendationKind = "host" | "sponsor" | "audience";

export type RolloverRecommendation = {
  kind: RolloverRecommendationKind;
  // The stable id staff select by. For hosts and audiences this is a Person id;
  // for sponsors it is a Sponsor id.
  id: string;
  name: string;
  detail: string;
  // A short, plain-language justification drawn from prior-Event evidence. Every
  // recommendation carries one so staff can see *why* before approving.
  reason: string;
  // Higher surfaces first: strongest evidence at the top of each list.
  weight: number;
};

// -- Returning Hosts --------------------------------------------------------

export type PriorHost = {
  personId: string;
  name: string;
  contact: string | null;
  groupName: string | null;
  guestsBrought: number;
  invitationsSent: number;
};

export function buildHostRecommendations(hosts: PriorHost[]): RolloverRecommendation[] {
  return hosts
    .map((host) => {
      const evidence: string[] = [];
      if (host.groupName) evidence.push(`Hosted ${host.groupName}`);
      if (host.guestsBrought > 0) evidence.push(`brought ${host.guestsBrought} guest${plural(host.guestsBrought)}`);
      if (host.invitationsSent > 0) evidence.push(`sent ${host.invitationsSent} invitation${plural(host.invitationsSent)}`);
      return {
        kind: "host" as const,
        id: host.personId,
        name: host.name,
        detail: host.contact ?? "No contact on file",
        reason: evidence.length ? `${capitalize(evidence.join(", "))} last year.` : "Hosted last year.",
        weight: host.guestsBrought * 10 + host.invitationsSent,
      };
    })
    .sort(byWeightThenName);
}

// -- Returning Sponsors -----------------------------------------------------

export type PriorSponsor = {
  sponsorId: string;
  name: string;
  contactName: string | null;
  level: string | null;
  committedCents: number;
  fullyFulfilled: boolean;
  currency: string;
};

export function buildSponsorRecommendations(sponsors: PriorSponsor[]): RolloverRecommendation[] {
  return sponsors
    .map((sponsor) => {
      const evidence: string[] = [];
      if (sponsor.level) evidence.push(`${sponsor.level} sponsor`);
      if (sponsor.committedCents > 0) evidence.push(`${formatMoney(sponsor.committedCents, sponsor.currency)} committed`);
      evidence.push(sponsor.fullyFulfilled ? "fully fulfilled" : "fulfillment incomplete");
      return {
        kind: "sponsor" as const,
        id: sponsor.sponsorId,
        name: sponsor.name,
        detail: sponsor.contactName ? `Contact: ${sponsor.contactName}` : "No primary contact on file",
        reason: `${capitalize(evidence.join(" · "))} last year.`,
        weight: sponsor.committedCents,
      };
    })
    .sort(byWeightThenName);
}

// -- Prior audience ---------------------------------------------------------

export type PriorAttendee = {
  personId: string;
  name: string;
  contact: string | null;
  attended: boolean;
  registered: boolean;
  invited: boolean;
};

// Strongest signal wins the evidence line and the sort weight: someone who
// actually attended is a better renewal target than someone merely invited.
export function buildAudienceRecommendations(people: PriorAttendee[]): RolloverRecommendation[] {
  return people
    .map((person) => {
      let reason: string;
      let weight: number;
      if (person.attended) { reason = "Attended last year."; weight = 3; }
      else if (person.registered) { reason = "Registered but didn't check in last year."; weight = 2; }
      else if (person.invited) { reason = "Invited last year, no attendance recorded."; weight = 1; }
      else { reason = "Appeared in last year's records."; weight = 0; }
      return {
        kind: "audience" as const,
        id: person.personId,
        name: person.name,
        detail: person.contact ?? "No contact on file",
        reason,
        weight,
      };
    })
    .sort(byWeightThenName);
}

function byWeightThenName(a: RolloverRecommendation, b: RolloverRecommendation) {
  return b.weight - a.weight || a.name.localeCompare(b.name);
}

function plural(count: number) {
  return count === 1 ? "" : "s";
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
