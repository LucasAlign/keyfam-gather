import { requireActor } from "@/lib/auth";
import { db } from "@/lib/db";
import type { AudienceCandidate } from "@/lib/communications";

const personSelect = { id: true, firstName: true, lastName: true, email: true, phone: true, communicationOptOut: true } as const;

// Assemble the deduplicated audience candidate list from event state, merged
// across registrations, hosts, invitations, and sponsors (issue #17). Shared by
// the compose preview and the send action so the audience is computed the same
// way in both places.
export async function loadAudienceCandidates(eventId: string): Promise<AudienceCandidate[]> {
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: {
      registrations: { where: { status: "ACTIVE" }, select: { person: { select: personSelect }, checkIn: { select: { reversedAt: true } } } },
      groups: { select: { capacity: true, _count: { select: { registrations: { where: { status: "ACTIVE" } } } }, hosts: { select: { person: { select: personSelect } } } } },
      invitations: { where: { status: { in: ["SENT", "OPENED", "NO_RESPONSE"] } }, select: { invitee: { select: personSelect } } },
      sponsors: { select: { primaryContact: { select: personSelect } } },
    },
  });
  if (!event) return [];

  type CandidatePerson = { id: string; firstName: string; lastName: string; email: string | null; phone: string | null; communicationOptOut: boolean };
  const candidates = new Map<string, AudienceCandidate>();
  const ensure = (person: CandidatePerson): AudienceCandidate => {
    let candidate = candidates.get(person.id);
    if (!candidate) {
      candidate = { personId: person.id, firstName: person.firstName, lastName: person.lastName, email: person.email, phone: person.phone, optOut: person.communicationOptOut, isRegistered: false, isCheckedIn: false, isHost: false, isUnderfilledGroupHost: false, invitationPending: false, isSponsorContact: false };
      candidates.set(person.id, candidate);
    }
    return candidate;
  };

  for (const registration of event.registrations) {
    const candidate = ensure(registration.person);
    candidate.isRegistered = true;
    if (registration.checkIn && registration.checkIn.reversedAt === null) candidate.isCheckedIn = true;
  }
  for (const group of event.groups) {
    const underfilled = group.capacity !== null && group._count.registrations < group.capacity;
    for (const host of group.hosts) {
      const candidate = ensure(host.person);
      candidate.isHost = true;
      if (underfilled) candidate.isUnderfilledGroupHost = true;
    }
  }
  for (const invitation of event.invitations) if (invitation.invitee) ensure(invitation.invitee).invitationPending = true;
  for (const sponsor of event.sponsors) if (sponsor.primaryContact) ensure(sponsor.primaryContact).isSponsorContact = true;

  return [...candidates.values()];
}

// Full workspace for the communications page: audience candidates, reusable
// templates, and recent campaign history.
export async function getCommunicationsWorkspace(eventId: string) {
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: {
      id: true, organizationId: true, name: true, startsAt: true, timezone: true, venue: true,
      messageTemplates: { orderBy: { updatedAt: "desc" } },
      campaigns: { orderBy: { createdAt: "desc" }, take: 25 },
    },
  });
  if (!event) return null;
  const access = await requireActor(event.organizationId, "invitation:manage", eventId);
  const candidates = await loadAudienceCandidates(eventId);
  return {
    access,
    event: { id: event.id, name: event.name, startsAt: event.startsAt, timezone: event.timezone, venue: event.venue },
    candidates,
    templates: event.messageTemplates,
    campaigns: event.campaigns,
  };
}
