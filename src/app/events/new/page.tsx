import Link from "next/link";
import { EventForm } from "@/components/event-form";
import { getCurrentOrganization } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function NewEventPage() {
  const organization = await getCurrentOrganization();
  return <div className="narrow"><Link className="back" href="/events">← Events</Link><p className="eyebrow">New event</p><h1>Bring people together</h1><p className="lede">Start with the essentials. You can configure registration and seating later.</p><EventForm organizationId={organization.id} /></div>;
}
