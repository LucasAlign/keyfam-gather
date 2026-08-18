import { notFound } from "next/navigation";
import { PublicRegistrationForm } from "@/components/public-registration-form";
import { db } from "@/lib/db";
export const dynamic = "force-dynamic";
export default async function PublicRegisterPage({ params }: { params: Promise<{ eventId: string }> }) { const { eventId } = await params; const event = await db.event.findUnique({ where: { id: eventId }, include: { registrationFields: { where: { isActive: true, visibility: "PUBLIC" }, include: { options: { orderBy: { sortOrder: "asc" } } }, orderBy: { sortOrder: "asc" } } } }); if (!event || !event.isPublic) notFound(); return <main className="narrow"><p className="eyebrow">Public registration</p><h1>{event.name}</h1><p>{event.description}</p><PublicRegistrationForm eventId={event.id} fields={event.registrationFields}/></main>; }
