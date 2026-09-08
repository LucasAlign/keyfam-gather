import { notFound } from "next/navigation";
import { PublicRegistrationForm } from "@/components/public-registration-form";
import { db } from "@/lib/db";
import { publicRegistrationAvailability } from "@/lib/public-registration-availability";
import { enforceIpRateLimit } from "@/lib/rate-limit-request";

export const dynamic = "force-dynamic";

export default async function PublicRegisterPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const limit = await enforceIpRateLimit("public-register-page", 60, 60 * 1000);
  if (!limit.allowed) return <main className="narrow"><div className="empty"><div className="empty-icon">◷</div><h1>Please slow down</h1><p>Too many requests from this connection. Try again in about {limit.retryAfterSeconds} seconds.</p></div></main>;
  const event = await db.event.findUnique({ where: { id: eventId }, include: { registrationFields: { where: { isActive: true, visibility: "PUBLIC" }, include: { options: { orderBy: { sortOrder: "asc" } } }, orderBy: { sortOrder: "asc" } } } });
  if (!event || !event.isPublic) notFound();
  const availability = publicRegistrationAvailability(event);
  return <main className="narrow"><p className="eyebrow">Public registration</p><h1>{event.name}</h1><p>{event.description}</p>{availability.available ? <PublicRegistrationForm eventId={event.id} fields={event.registrationFields} /> : <div className="empty compact"><h2>Registration unavailable</h2><p>{availability.message}</p>{event.contactEmail && <p>Questions? Contact <a href={`mailto:${event.contactEmail}`}>{event.contactName || event.contactEmail}</a>.</p>}</div>}</main>;
}
