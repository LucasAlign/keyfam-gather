"use client";

import type { Campaign, DeliveryChannel, MessageCategory, MessageTemplate } from "@prisma/client";
import { useActionState, useState } from "react";
import { createCampaign, createMessageTemplate, sendCampaign, type CommunicationsActionState } from "@/app/communications-actions";
import { SubmitButton } from "@/components/submit-button";
import { MESSAGE_CATEGORIES, SEGMENTS, type SegmentId, TEMPLATE_PLACEHOLDERS } from "@/lib/communications";

const initial: CommunicationsActionState = {};
type AudienceCounts = Record<SegmentId, { EMAIL: number; SMS: number }>;

export function CampaignComposer({ eventId, templates, audienceCounts }: { eventId: string; templates: MessageTemplate[]; audienceCounts: AudienceCounts }) {
  const [state, action] = useActionState(createCampaign, initial);
  const [channel, setChannel] = useState<DeliveryChannel>("EMAIL");
  const [category, setCategory] = useState<MessageCategory>("REMINDER");
  const [segment, setSegment] = useState<SegmentId>("active_registrations");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const error = (name: string) => state.fields?.[name]?.[0];
  const audience = audienceCounts[segment]?.[channel] ?? 0;

  const applyTemplate = (id: string) => {
    const template = templates.find((item) => item.id === id);
    if (!template) return;
    setChannel(template.channel);
    setCategory(template.category);
    setSubject(template.subject ?? "");
    setBody(template.body);
  };

  return <form action={action} className="form-card">
    <h2>Compose a campaign</h2>
    {state.error && <div className="alert" role="alert">{state.error}</div>}
    {state.success && <div className="success" role="status">{state.success}</div>}
    <input type="hidden" name="eventId" value={eventId} />
    <div className="field-row">
      <label>Campaign name<input name="name" required />{error("name") && <small>{error("name")}</small>}</label>
      <label>Start from a template<select defaultValue="" onChange={(event) => applyTemplate(event.target.value)}><option value="">— none —</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label>
    </div>
    <div className="field-row">
      <label>Purpose<select name="category" value={category} onChange={(event) => setCategory(event.target.value as MessageCategory)}>{MESSAGE_CATEGORIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      <label>Channel<select name="channel" value={channel} onChange={(event) => setChannel(event.target.value as DeliveryChannel)}><option value="EMAIL">Email</option><option value="SMS">SMS</option></select></label>
    </div>
    <label>Audience
      <select name="segment" value={segment} onChange={(event) => setSegment(event.target.value as SegmentId)}>{SEGMENTS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
    </label>
    <p className="form-hint">{SEGMENTS.find((item) => item.id === segment)?.description} · <strong>{audience}</strong> reachable by {channel === "EMAIL" ? "email" : "SMS"} right now (opt-outs excluded).</p>
    {channel === "EMAIL" && <label>Subject<input name="subject" value={subject} onChange={(event) => setSubject(event.target.value)} />{error("subject") && <small>{error("subject")}</small>}</label>}
    <label>Message<textarea name="body" rows={6} value={body} onChange={(event) => setBody(event.target.value)} required />{error("body") && <small>{error("body")}</small>}</label>
    <p className="form-hint">Placeholders: {TEMPLATE_PLACEHOLDERS.map((token) => `{{${token}}}`).join(", ")}</p>
    <label>Schedule for (optional)<input name="scheduledFor" type="datetime-local" /></label>
    <SubmitButton pendingText="Saving…">Create draft for review</SubmitButton>
  </form>;
}

export function TemplateComposer({ eventId }: { eventId: string }) {
  const [state, action] = useActionState(createMessageTemplate, initial);
  const [channel, setChannel] = useState<DeliveryChannel>("EMAIL");
  const error = (name: string) => state.fields?.[name]?.[0];
  return <form action={action} className="form-card compact-form">
    <h2>New template</h2>
    {state.error && <div className="alert" role="alert">{state.error}</div>}
    {state.success && <div className="success" role="status">{state.success}</div>}
    <input type="hidden" name="eventId" value={eventId} />
    <div className="field-row">
      <label>Name<input name="name" required />{error("name") && <small>{error("name")}</small>}</label>
      <label>Purpose<select name="category">{MESSAGE_CATEGORIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
    </div>
    <label>Channel<select name="channel" value={channel} onChange={(event) => setChannel(event.target.value as DeliveryChannel)}><option value="EMAIL">Email</option><option value="SMS">SMS</option></select></label>
    {channel === "EMAIL" && <label>Subject<input name="subject" /></label>}
    <label>Body<textarea name="body" rows={4} required />{error("body") && <small>{error("body")}</small>}</label>
    <SubmitButton pendingText="Saving…">Save template</SubmitButton>
  </form>;
}

export function SendCampaignButton({ campaign, audienceSize }: { campaign: Campaign; audienceSize: number }) {
  const [state, action] = useActionState(sendCampaign, initial);
  return <form action={action} className="campaign-send" onSubmit={(event) => { if (!window.confirm(`Send "${campaign.name}" to ${audienceSize} recipient${audienceSize === 1 ? "" : "s"} now? This can't be undone.`)) event.preventDefault(); }}>
    <input type="hidden" name="campaignId" value={campaign.id} />
    {state.error && <div className="alert" role="alert">{state.error}</div>}
    {state.success && <div className="success" role="status">{state.success}</div>}
    <SubmitButton pendingText="Sending…" disabled={audienceSize === 0}>Approve &amp; send to {audienceSize}</SubmitButton>
  </form>;
}
