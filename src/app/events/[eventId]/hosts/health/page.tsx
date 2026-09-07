import Link from "next/link";
import { notFound } from "next/navigation";
import { HostAccessCard, type HostAccessCardData } from "@/components/host-access-card";
import { requireActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildHostGroupHealth, type HostGroupHealth, type HostLinkStatus, sortByFollowUp, summarizeHostHealth } from "@/lib/host-health";

export const dynamic = "force-dynamic";

type Filter = "all" | "needs" | "urgent";

export default async function HostHealthPage({ params, searchParams }: { params: Promise<{ eventId: string }>; searchParams: Promise<{ filter?: string }> }) {
  const { eventId } = await params;
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: {
      id: true, organizationId: true, name: true,
      eventHosts: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          person: { select: { firstName: true, lastName: true, email: true, phone: true } },
          group: { select: { id: true, name: true, capacity: true, registrations: { where: { status: "ACTIVE" }, select: { person: { select: { email: true, phone: true } } } } } },
          accessTokens: { orderBy: { createdAt: "desc" } },
        },
      },
    },
  });
  if (!event) notFound();
  await requireActor(event.organizationId, "host:manage", eventId);
  const now = new Date();
  const { filter: filterParam } = await searchParams;
  const filter: Filter = filterParam === "needs" || filterParam === "urgent" ? filterParam : "all";

  const rows = event.eventHosts.map((host) => {
    const current = host.accessTokens.find((token) => !token.revokedAt && token.expiresAt > now);
    const latest = host.accessTokens[0];
    const linkStatus: HostLinkStatus = current ? "active" : !latest ? "none" : latest.revokedAt ? "revoked" : "expired";
    const rotatable = current ?? latest;
    const cardData: HostAccessCardData = {
      eventId,
      eventHostId: host.id,
      hostName: `${host.person.firstName} ${host.person.lastName}`,
      groupName: host.group.name,
      status: linkStatus,
      tokenId: current?.id ?? null,
      rotatableTokenId: rotatable?.id ?? null,
      expiresAt: current?.expiresAt ?? null,
      lastUsedAt: current?.lastUsedAt ?? latest?.lastUsedAt ?? null,
      canRecover: Boolean(current?.tokenCipher),
      canResend: Boolean(current?.tokenCipher) && Boolean(host.person.email || host.person.phone),
    };
    const health = buildHostGroupHealth({
      groupId: host.group.id,
      groupName: host.group.name,
      hostName: `${host.person.firstName} ${host.person.lastName}`,
      capacity: host.group.capacity,
      activeRegistrations: host.group.registrations.length,
      missingContactCount: host.group.registrations.filter((registration) => !registration.person.email && !registration.person.phone).length,
      linkStatus,
      lastActivityAt: current?.lastUsedAt ?? latest?.lastUsedAt ?? null,
    });
    return { health, cardData };
  });

  const summary = summarizeHostHealth(rows.map((row) => row.health));
  const ordered = sortByFollowUp(rows.map((row) => row.health));
  const cardByGroup = new Map(rows.map((row) => [row.health.groupId, row.cardData]));
  const visible = ordered.filter((row) => filter === "all" || (filter === "urgent" ? row.followUp.level === "urgent" : row.followUp.level !== "ok"));

  const filterLink = (value: Filter, label: string) => <Link className={`chip ${filter === value ? "is-active" : ""}`} href={`/events/${eventId}/hosts/health${value === "all" ? "" : `?filter=${value}`}`}>{label}</Link>;
  const badgeClass = (level: HostGroupHealth["followUp"]["level"]) => level === "urgent" ? "priority-required" : level === "attention" ? "priority-recommended" : "priority-optional";

  return <div className="narrow wide-narrow">
    <Link className="back" href={`/events/${eventId}/hosts/new`}>← Hosts & groups</Link>
    <div className="page-heading"><div><p className="eyebrow">Hosts & groups</p><h1>Host &amp; Group health</h1><p className="lede">Every hosted Group in one view — seats filled, missing guest details, portal status, and who needs a nudge. Counts exclude cancelled and superseded registrations.</p></div></div>

    <section className="metrics dashboard-metrics" aria-label="Host health totals">
      <div><strong>{summary.groups}</strong><span>Hosted Groups</span></div>
      <div className={summary.needsFollowUp ? "metric-attention" : ""}><strong>{summary.needsFollowUp}</strong><span>Need follow-up</span></div>
      <div className={summary.urgent ? "metric-attention" : ""}><strong>{summary.urgent}</strong><span>Urgent</span></div>
      <div><strong>{summary.openSeats}</strong><span>Open seats</span></div>
      <div className={summary.missingContacts ? "metric-attention" : ""}><strong>{summary.missingContacts}</strong><span>Missing contacts</span></div>
    </section>

    <div className="chip-row">{filterLink("all", `All (${summary.groups})`)}{filterLink("needs", `Needs follow-up (${summary.needsFollowUp})`)}{filterLink("urgent", `Urgent (${summary.urgent})`)}</div>

    {event.eventHosts.length === 0
      ? <div className="empty compact"><h3>No hosts yet</h3><p>Welcome a host to a group to start tracking group health.</p><Link className="button secondary" href={`/events/${eventId}/hosts/new`}>Add a host</Link></div>
      : visible.length === 0
        ? <div className="empty compact"><h3>Nothing to chase here</h3><p>No hosted Groups match this filter.</p></div>
        : <div className="host-health-list">{visible.map((row) => {
            const card = cardByGroup.get(row.groupId)!;
            return <article key={row.groupId} className={`host-health-card level-${row.followUp.level}`}>
              <div className="host-health-head">
                <div><strong>{row.groupName}</strong><p>Hosted by {row.hostName}</p></div>
                <span className={`setup-tag ${badgeClass(row.followUp.level)}`}>{row.followUp.level === "ok" ? "On track" : row.followUp.level === "urgent" ? "Urgent" : "Follow up"}</span>
              </div>
              <div className="host-health-stats">
                <div><strong>{row.capacity === null ? row.activeRegistrations : `${row.activeRegistrations}/${row.capacity}`}</strong><span>Registered</span></div>
                <div><strong>{row.remaining === null ? "—" : row.remaining}</strong><span>Seats open</span></div>
                <div className={row.missingContactCount ? "stat-attention" : ""}><strong>{row.missingContactCount}</strong><span>Missing contacts</span></div>
              </div>
              {row.followUp.reasons.length > 0 && <ul className="host-health-reasons">{row.followUp.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>}
              <HostAccessCard host={card} />
            </article>;
          })}</div>}
  </div>;
}
