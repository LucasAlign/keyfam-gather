import Link from "next/link";
import { notFound } from "next/navigation";
import { EventRolloverForm } from "@/components/event-rollover-form";
import { requireActor } from "@/lib/auth";
import { getRolloverWorkspace } from "@/lib/event-rollover-service";

export const dynamic = "force-dynamic";

export default async function EventRolloverPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const workspace = await getRolloverWorkspace(eventId);
  if (!workspace) notFound();
  await requireActor(workspace.source.organizationId, "event:create", eventId);

  return <div className="narrow wide-narrow">
    <Link className="back" href={`/events/${eventId}/settings`}>← {workspace.source.name}</Link>
    <div className="page-heading"><div><p className="eyebrow">Next-year rollover</p><h1>Roll {workspace.source.name} into next year</h1><p className="lede">Create a fresh draft from this event&apos;s configuration and choose which returning hosts, sponsors, and guests to invite again. Last year&apos;s registrations and attendance stay historical — nothing is re-registered.</p></div></div>
    <EventRolloverForm
      eventId={workspace.source.id}
      timezone={workspace.source.timezone}
      configurationPreview={workspace.configurationPreview}
      hosts={workspace.hostRecommendations}
      sponsors={workspace.sponsorRecommendations}
      audience={workspace.audienceRecommendations}
    />
  </div>;
}
