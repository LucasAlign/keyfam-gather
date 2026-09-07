import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { copyEventConfiguration } from "@/lib/event-configuration";
import {
  buildAudienceRecommendations,
  buildHostRecommendations,
  buildSponsorRecommendations,
  type PriorAttendee,
  summarizeReusableConfiguration,
} from "@/lib/event-rollover";
import { createInvitationToken } from "@/lib/invitations";
import { normalizeEmail, normalizePhone } from "@/lib/normalization";

const AUDIENCE_LIMIT = 200;

function personName(person: { firstName: string; lastName: string }) {
  return `${person.firstName} ${person.lastName}`.trim();
}

function personContact(person: { email: string | null; phone: string | null }) {
  return person.email ?? person.phone ?? null;
}

// ---------------------------------------------------------------------------
// Loader: assemble the rollover preview for a source Event — configuration that
// will be copied plus evidence-backed returning-Host, Sponsor, and audience
// recommendations. Nothing is mutated here.
// ---------------------------------------------------------------------------
export async function getRolloverWorkspace(eventId: string) {
  const source = await db.event.findUnique({
    where: { id: eventId },
    select: {
      id: true, organizationId: true, name: true, timezone: true, currency: true,
      _count: { select: { groups: true, seatingTables: true, registrationFields: true } },
    },
  });
  if (!source) return null;

  const [hosts, regByGroup, sponsors, registrations, invitations] = await Promise.all([
    db.eventHost.findMany({
      where: { eventId },
      select: { personId: true, person: { select: { firstName: true, lastName: true, email: true, phone: true } }, group: { select: { id: true, name: true } }, _count: { select: { sentInvitations: true } } },
    }),
    db.registration.groupBy({ by: ["groupId"], where: { eventId, status: "ACTIVE", groupId: { not: null } }, _count: { _all: true } }),
    db.sponsor.findMany({
      where: { eventId },
      select: { id: true, name: true, primaryContact: { select: { firstName: true, lastName: true } }, sponsorships: { select: { level: true, fulfillmentStatus: true, commitment: { select: { amountCents: true } } } } },
    }),
    db.registration.findMany({
      where: { eventId },
      select: { personId: true, status: true, person: { select: { firstName: true, lastName: true, email: true, phone: true } }, checkIn: { select: { reversedAt: true } } },
    }),
    db.invitation.findMany({
      where: { eventId, inviteeId: { not: null } },
      select: { inviteeId: true, invitee: { select: { firstName: true, lastName: true, email: true, phone: true } } },
    }),
  ]);

  const guestsByGroup = new Map(regByGroup.map((row) => [row.groupId, row._count._all]));

  const hostRecommendations = buildHostRecommendations(hosts.map((host) => ({
    personId: host.personId,
    name: personName(host.person),
    contact: personContact(host.person),
    groupName: host.group?.name ?? null,
    guestsBrought: host.group ? guestsByGroup.get(host.group.id) ?? 0 : 0,
    invitationsSent: host._count.sentInvitations,
  })));

  const sponsorRecommendations = buildSponsorRecommendations(sponsors.map((sponsor) => ({
    sponsorId: sponsor.id,
    name: sponsor.name,
    contactName: sponsor.primaryContact ? personName(sponsor.primaryContact) : null,
    level: sponsor.sponsorships[0]?.level ?? null,
    committedCents: sponsor.sponsorships.reduce((sum, item) => sum + item.commitment.amountCents, 0),
    fullyFulfilled: sponsor.sponsorships.length > 0 && sponsor.sponsorships.every((item) => item.fulfillmentStatus === "COMPLETE"),
    currency: source.currency,
  })));

  // Dedupe every prior participant into a single audience candidate, keeping the
  // strongest signal we saw for them (attended > registered > invited).
  const audience = new Map<string, PriorAttendee>();
  const upsert = (personId: string, person: { firstName: string; lastName: string; email: string | null; phone: string | null }, signal: Partial<PriorAttendee>) => {
    const existing = audience.get(personId);
    if (existing) {
      existing.attended ||= signal.attended ?? false;
      existing.registered ||= signal.registered ?? false;
      existing.invited ||= signal.invited ?? false;
      return;
    }
    audience.set(personId, { personId, name: personName(person), contact: personContact(person), attended: signal.attended ?? false, registered: signal.registered ?? false, invited: signal.invited ?? false });
  };
  for (const registration of registrations) {
    upsert(registration.personId, registration.person, { registered: registration.status === "ACTIVE", attended: registration.checkIn !== null && registration.checkIn.reversedAt === null });
  }
  for (const invitation of invitations) {
    if (invitation.inviteeId && invitation.invitee) upsert(invitation.inviteeId, invitation.invitee, { invited: true });
  }

  const audienceRecommendations = buildAudienceRecommendations([...audience.values()]).slice(0, AUDIENCE_LIMIT);

  return {
    source: { id: source.id, name: source.name, timezone: source.timezone, organizationId: source.organizationId },
    configurationPreview: summarizeReusableConfiguration({ groups: source._count.groups, seatingTables: source._count.seatingTables, registrationFields: source._count.registrationFields }),
    hostRecommendations,
    sponsorRecommendations,
    audienceRecommendations,
  };
}

// ---------------------------------------------------------------------------
// Mutation: create the next-year Event and seed the approved renewal outreach.
//
// Guarantees:
//  - Historical participation is never copied as current attendance. The only
//    records written to the new Event are configuration (via copyEventConfiguration)
//    and DRAFT Invitations for the People staff explicitly selected.
//  - The new Event links back to the prior Event (rolledOverFromEventId) for
//    year-over-year reporting.
//  - Selected People resolve within the acting Organization (and selected
//    Sponsors within the prior Event); ids outside that scope are ignored.
// ---------------------------------------------------------------------------
export type RolloverInput = {
  eventId: string;
  organizationId: string;
  actorId: string;
  name: string;
  startsAt: Date;
  endsAt: Date;
  registrationOpensAt?: Date;
  registrationClosesAt?: Date;
  selectedPersonIds: string[];
  selectedSponsorIds: string[];
};

export async function performEventRollover(input: RolloverInput) {
  // Resolve the People behind the selections against the prior Event before the
  // transaction: returning Hosts/audience are Person ids; Sponsors contribute
  // their primary contact. Only People we can actually reach get a draft.
  const personIds = new Set(input.selectedPersonIds);
  const sponsorContacts = input.selectedSponsorIds.length
    ? await db.sponsor.findMany({ where: { id: { in: input.selectedSponsorIds }, eventId: input.eventId }, select: { primaryContactPersonId: true } })
    : [];
  for (const sponsor of sponsorContacts) if (sponsor.primaryContactPersonId) personIds.add(sponsor.primaryContactPersonId);

  const people = personIds.size
    ? await db.person.findMany({ where: { id: { in: [...personIds] }, organizationId: input.organizationId, mergedIntoPersonId: null }, select: { id: true, firstName: true, lastName: true, email: true, phone: true } })
    : [];
  // Only People with an email or phone can be sent renewal outreach; the rest are
  // reported back so staff know who still needs contact details.
  const reachable = people.filter((person) => person.email || person.phone);
  const skipped = people.length - reachable.length;

  return db.$transaction(async (tx) => {
    const { created, copied } = await copyEventConfiguration(tx, { ...input, rolledOverFromEventId: input.eventId });

    let draftedInvitations = 0;
    for (const person of reachable) {
      const issued = createInvitationToken();
      const invitation = await tx.invitation.create({ data: {
        organizationId: input.organizationId,
        eventId: created.id,
        senderId: input.actorId,
        inviteeId: person.id,
        firstName: person.firstName,
        lastName: person.lastName,
        email: person.email,
        emailNormalized: person.email ? normalizeEmail(person.email) : null,
        phone: person.phone,
        phoneNormalized: person.phone ? normalizePhone(person.phone) : null,
        tokenHash: issued.tokenHash,
        expiresAt: issued.expiresAt,
      } });
      await tx.auditLog.create({ data: { organizationId: input.organizationId, eventId: created.id, actorId: input.actorId, action: "invitation.created", entityType: "Invitation", entityId: invitation.id, newState: JSON.stringify({ status: invitation.status, source: "rollover", rolledOverFromEventId: input.eventId }) } });
      draftedInvitations += 1;
    }

    await tx.auditLog.create({ data: { organizationId: input.organizationId, eventId: created.id, actorId: input.actorId, action: "event.rolled_over", entityType: "Event", entityId: created.id, newState: JSON.stringify({ rolledOverFromEventId: input.eventId, copiedGroups: copied.groups, copiedTables: copied.seatingTables, copiedRegistrationFields: copied.registrationFields, draftedInvitations, skippedNoContact: skipped }) } });

    return { event: created, draftedInvitations, skipped };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
