import Link from "next/link";
import { notFound } from "next/navigation";
import { CampaignComposer, SendCampaignButton, TemplateComposer } from "@/components/communications-center";
import { buildAudience, MESSAGE_CATEGORIES, SEGMENTS, type SegmentId } from "@/lib/communications";
import { getCommunicationsWorkspace } from "@/lib/communications-workspace";

export const dynamic = "force-dynamic";

const categoryLabel = (id: string) => MESSAGE_CATEGORIES.find((item) => item.id === id)?.label ?? id;
const segmentLabel = (id: string) => SEGMENTS.find((item) => item.id === id)?.label ?? id;

export default async function CommunicationsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const workspace = await getCommunicationsWorkspace(eventId);
  if (!workspace) notFound();
  const { event, candidates, templates, campaigns } = workspace;

  // Reachable count per segment × channel, opt-outs excluded — drives the live
  // audience preview and each draft's send button.
  const audienceCounts = Object.fromEntries(SEGMENTS.map((segment) => [segment.id, {
    EMAIL: buildAudience(candidates, segment.id, "EMAIL").recipients.length,
    SMS: buildAudience(candidates, segment.id, "SMS").recipients.length,
  }])) as Record<SegmentId, { EMAIL: number; SMS: number }>;

  return <div className="narrow wide-narrow">
    <Link className="back" href={`/events/${eventId}`}>← {event.name}</Link>
    <div className="page-heading"><div><p className="eyebrow">Communications</p><h1>Communications center</h1><p className="lede">Build an audience from event state, preview it, and send after explicit approval. Opt-outs and unreachable contacts are always excluded and reported.</p></div></div>

    <div className="comms-layout">
      <CampaignComposer eventId={eventId} templates={templates} audienceCounts={audienceCounts} />

      <section className="event-section">
        <div className="section-heading"><h2>Campaigns</h2><span>{campaigns.length}</span></div>
        {campaigns.length === 0
          ? <div className="empty compact"><h3>No campaigns yet</h3><p>Compose one above — it starts as a reviewable draft.</p></div>
          : <div className="campaign-list">{campaigns.map((campaign) => {
              const audienceSize = audienceCounts[campaign.segment as SegmentId]?.[campaign.channel] ?? 0;
              return <article key={campaign.id} className={`campaign-card status-${campaign.status.toLowerCase()}`}>
                <div className="campaign-head">
                  <div><strong>{campaign.name}</strong><p>{categoryLabel(campaign.category)} · {campaign.channel} · {segmentLabel(campaign.segment)}</p></div>
                  <span className="invitation-status">{campaign.status === "SENT" ? "Sent" : campaign.status === "SCHEDULED" ? "Scheduled" : "Draft"}</span>
                </div>
                {campaign.subject && <p className="campaign-subject">{campaign.subject}</p>}
                <p className="campaign-body">{campaign.body}</p>
                {campaign.status === "SENT"
                  ? <div className="campaign-metrics"><span className="ok-text">{campaign.sentCount} sent</span>{campaign.failedCount > 0 && <span className="issue-text">{campaign.failedCount} failed</span>}{campaign.optedOutCount > 0 && <span>{campaign.optedOutCount} opted out</span>}<span>{campaign.sentAt ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(campaign.sentAt) : ""}</span></div>
                  : <>
                      {campaign.scheduledFor && <p className="form-hint">Scheduled for {new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: event.timezone }).format(campaign.scheduledFor)}</p>}
                      <SendCampaignButton campaign={campaign} audienceSize={audienceSize} />
                    </>}
              </article>;
            })}</div>}
      </section>

      <section className="event-section">
        <div className="section-heading"><h2>Templates</h2><span>{templates.length}</span></div>
        {templates.length > 0 && <div className="template-list">{templates.map((template) => <article key={template.id} className="template-card"><div><strong>{template.name}</strong><p>{categoryLabel(template.category)} · {template.channel}</p></div>{template.subject && <small>{template.subject}</small>}</article>)}</div>}
        <TemplateComposer eventId={eventId} />
      </section>
    </div>
  </div>;
}
