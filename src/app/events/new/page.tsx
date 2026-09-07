import Link from "next/link";
import { EventForm } from "@/components/event-form";
import { EventBuilderForm } from "@/components/event-builder-form";
import { getCurrentOrganization, requireActor } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function NewEventPage() {
  const organization = await getCurrentOrganization();
  await requireActor(organization.id, "event:create");
  return <div className="narrow"><Link className="back" href="/events">← Events</Link><p className="eyebrow">New event</p><h1>Bring people together</h1><p className="lede">Describe the Event for a reviewed setup proposal, or enter the details manually.</p><EventBuilderForm organizationId={organization.id} /><details className="manual-event"><summary>Enter Event details manually</summary><EventForm organizationId={organization.id} /></details></div>;
}
