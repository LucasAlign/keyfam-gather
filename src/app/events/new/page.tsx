import Link from "next/link";
import { EventForm } from "@/components/event-form";
import { EventBuilderForm } from "@/components/event-builder-form";
import { getCurrentOrganization, requireActor } from "@/lib/auth";
import { getEventTemplate, templateFormDefaults } from "@/lib/event-templates";

export const dynamic = "force-dynamic";

export default async function NewEventPage({ searchParams }: { searchParams: Promise<{ template?: string }> }) {
  const organization = await getCurrentOrganization();
  await requireActor(organization.id, "event:create");
  const template = getEventTemplate((await searchParams).template);

  // A chosen template opens the manual form pre-filled and expanded; the guided
  // "describe it" builder stays available below. Without a template we lead with
  // the builder, as before.
  if (template) {
    return <div className="narrow"><Link className="back" href="/events">← Events</Link><p className="eyebrow">New event · {template.emoji} {template.label}</p><h1>Bring people together</h1><p className="lede">{template.tagline} We&apos;ve filled in a starting point — set the date, then adjust anything before you create it.</p>
      <EventForm organizationId={organization.id} defaults={templateFormDefaults(template)} scheduleHours={template.durationHours} />
      <details className="manual-event"><summary>Describe the Event for a suggested setup instead</summary><EventBuilderForm organizationId={organization.id} /></details>
    </div>;
  }

  return <div className="narrow"><Link className="back" href="/events">← Events</Link><p className="eyebrow">New event</p><h1>Bring people together</h1><p className="lede">Describe the Event for a reviewed setup proposal, or enter the details manually.</p><EventBuilderForm organizationId={organization.id} /><details className="manual-event"><summary>Enter Event details manually</summary><EventForm organizationId={organization.id} /></details></div>;
}
