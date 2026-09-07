import Link from "next/link";
import { notFound } from "next/navigation";
import { RegistrationImportForm } from "@/components/registration-import-form";
import { requireActor } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function RegistrationImportPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const event = await db.event.findUnique({ where: { id: eventId }, select: { id: true, organizationId: true, name: true } });
  if (!event) notFound();
  await requireActor(event.organizationId, "registration:manage", eventId);
  return <div className="narrow wide-narrow">
    <Link className="back" href={`/events/${event.id}/registrations`}>← Manage registrants</Link>
    <div className="page-heading"><div><p className="eyebrow">Data import</p><h1>Import registrants from CSV</h1><p className="lede">Bring existing guests in from a spreadsheet. Map your columns, review every row, and import — matching People are reused so it&apos;s safe to run more than once.</p></div></div>
    <RegistrationImportForm eventId={event.id} />
  </div>;
}
