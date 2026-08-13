import Link from "next/link";
import { notFound } from "next/navigation";
import { GroupForm } from "@/components/group-form";
import { HostForm } from "@/components/host-form";
import { requireActor } from "@/lib/auth";
import { db } from "@/lib/db";
export default async function NewHostPage({ params, searchParams }: { params: Promise<{ eventId: string }>; searchParams: Promise<{ access?: string; groupCreated?: string }> }) {
  const { eventId } = await params;
  const event = await db.event.findUnique({ where: { id: eventId }, include: { groups: { include: { _count: { select: { registrations: true } } }, orderBy: { name: "asc" } } } });
  if (!event) notFound(); await requireActor(event.organizationId, "host:manage", eventId); const { access, groupCreated } = await searchParams;
  return <div className="narrow"><Link className="back" href={`/events/${eventId}`}>← {event.name}</Link><div className="page-heading"><div><p className="eyebrow">Hosts & groups</p><h1>Welcome a host</h1><p>Create a group automatically or connect the host to an existing group.</p></div></div>{access && <div className="access-card" role="status"><h2>Host access is ready</h2><p>Share this private link securely. It expires in 30 days and should be treated like a password.</p><Link className="portal-link" href={`/host/${access}`}>Open host portal</Link></div>}{groupCreated && <div className="success" role="status">Group created successfully.</div>}<HostForm eventId={eventId} groups={event.groups.map((group) => ({ id: group.id, name: group.name, capacity: group.capacity, occupied: group._count.registrations }))} /><GroupForm eventId={eventId} /></div>;
}
