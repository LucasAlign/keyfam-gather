"use client";

import { useActionState, useMemo, useState } from "react";
import { rolloverEvent, type EventRolloverActionState } from "@/app/event-rollover-actions";
import { SubmitButton } from "@/components/submit-button";
import type { ConfigurationPreviewItem, RolloverRecommendation } from "@/lib/event-rollover";
import { PRESERVED_HISTORY } from "@/lib/event-rollover";

const initial: EventRolloverActionState = {};

type Selectable = RolloverRecommendation & { hasContact: boolean };

function RecommendationList({ title, empty, items, selected, onToggle, note }: {
  title: string;
  empty: string;
  items: Selectable[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  note?: string;
}) {
  return <div className="rollover-recommendations">
    <div className="section-heading"><h3>{title}</h3><span>{items.length}</span></div>
    {note && <p className="form-hint">{note}</p>}
    {items.length === 0 ? <p className="form-hint">{empty}</p> : <ul className="rollover-candidate-list">
      {items.map((item) => <li key={item.id} className={`rollover-candidate ${selected.has(item.id) ? "is-selected" : ""}`}>
        <label className="choice">
          <input type="checkbox" checked={selected.has(item.id)} onChange={() => onToggle(item.id)} disabled={!item.hasContact} />
          <span className="rollover-candidate-body">
            <strong>{item.name}</strong>
            <small>{item.detail}</small>
            <em>{item.reason}</em>
            {!item.hasContact && <small className="rollover-flag">No email or phone on file — add contact details before inviting.</small>}
          </span>
        </label>
      </li>)}
    </ul>}
  </div>;
}

// A recommendation is contactable when its detail carries an email or phone (the
// loader puts the contact there, or "No contact on file" when there is none).
function isContactable(item: RolloverRecommendation) {
  return item.detail !== "No contact on file" && item.detail !== "No primary contact on file";
}

export function EventRolloverForm({ eventId, timezone, configurationPreview, hosts, sponsors, audience }: {
  eventId: string;
  timezone: string;
  configurationPreview: ConfigurationPreviewItem[];
  hosts: RolloverRecommendation[];
  sponsors: RolloverRecommendation[];
  audience: RolloverRecommendation[];
}) {
  const [state, action] = useActionState(rolloverEvent, initial);
  const [selectedPeople, setSelectedPeople] = useState<Set<string>>(new Set());
  const [selectedSponsors, setSelectedSponsors] = useState<Set<string>>(new Set());

  const decorate = (items: RolloverRecommendation[]): Selectable[] => items.map((item) => ({ ...item, hasContact: isContactable(item) }));
  const hostItems = useMemo(() => decorate(hosts), [hosts]);
  const sponsorItems = useMemo(() => decorate(sponsors), [sponsors]);
  const audienceItems = useMemo(() => decorate(audience), [audience]);

  const toggle = (setter: React.Dispatch<React.SetStateAction<Set<string>>>) => (id: string) => setter((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const selectedCount = selectedPeople.size + selectedSponsors.size;

  return <form action={action} className="form-card rollover-form">
    <input type="hidden" name="eventId" value={eventId} />
    <input type="hidden" name="timezone" value={timezone} />
    {[...selectedPeople].map((id) => <input key={`p-${id}`} type="hidden" name="personId" value={id} />)}
    {[...selectedSponsors].map((id) => <input key={`s-${id}`} type="hidden" name="sponsorId" value={id} />)}
    {state.error && <div className="alert" role="alert">{state.error}</div>}

    <h2>New event details</h2>
    <label>New event name<input name="name" required /></label>
    <div className="field-row"><label>Starts<input name="startsAt" type="datetime-local" required /></label><label>Ends<input name="endsAt" type="datetime-local" required /></label></div>
    <div className="field-row"><label>Registration opens<input name="registrationOpensAt" type="datetime-local" /></label><label>Registration closes<input name="registrationClosesAt" type="datetime-local" /></label></div>

    <div className="rollover-preview">
      <h3>Configuration that will be copied</h3>
      <ul className="rollover-config-list">{configurationPreview.map((item) => <li key={item.label}><strong>{item.label}</strong> · {item.detail}</li>)}</ul>
      <div className="rollover-history-note">
        <strong>Left in the past — nothing here is copied as current attendance:</strong>
        <ul>{PRESERVED_HISTORY.map((line) => <li key={line}>{line}</li>)}</ul>
      </div>
    </div>

    <fieldset className="rollover-selection">
      <legend>Renewal outreach</legend>
      <p className="form-hint">Select prior participants to draft renewal invitations for. Nothing is registered — each becomes a DRAFT invitation on the new event that you review and send. Every recommendation shows the evidence behind it.</p>
      <RecommendationList title="Returning hosts" empty="No hosts on the prior event." items={hostItems} selected={selectedPeople} onToggle={toggle(setSelectedPeople)} />
      <RecommendationList title="Returning sponsors" empty="No sponsors on the prior event." items={sponsorItems} selected={selectedSponsors} onToggle={toggle(setSelectedSponsors)} note="Selecting a sponsor drafts renewal outreach to its primary contact." />
      <RecommendationList title="Prior audience" empty="No prior registrants or invitees." items={audienceItems} selected={selectedPeople} onToggle={toggle(setSelectedPeople)} />
    </fieldset>

    <p className="form-hint">{selectedCount === 0 ? "No renewal invitations selected — the new event will be created from configuration only." : `${selectedCount} selection${selectedCount === 1 ? "" : "s"} will draft renewal invitations.`}</p>
    <SubmitButton pendingText="Rolling over…">Create next-year event</SubmitButton>
  </form>;
}
