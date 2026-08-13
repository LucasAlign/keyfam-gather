import Link from "next/link";
import { notFound } from "next/navigation";
import { RegistrationForm } from "@/components/registration-form";
import { requireActor } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function RegisterPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const event = await db.event.findUnique({ where: { id: eventId } });
  if (!event) notFound();
  await requireActor(event.organizationId, "registration:create", eventId);
  return <div className="narrow"><Link className="back" href={`/events/${event.id}`}>← {event.name}</Link><p className="eyebrow">Staff registration</p><h1>Add a registrant</h1><p className="lede">We’ll check for an existing person before creating a new record.</p><RegistrationForm eventId={event.id} /></div>;
}
