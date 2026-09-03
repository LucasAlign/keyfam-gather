"use client";

import { useActionState, useState } from "react";
import { substituteGuest, type ActionState } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";
import { buildSubstitutionPreview, type SubstitutionOriginal, type TargetTableCapacity } from "@/lib/substitution";

const initial: ActionState = {};

export type SubstitutionPerson = { id: string; name: string; detail: string };

export function GuestSubstitutionForm({ eventId, registrationId, original, hasGroup, hasParty, hasTable, targetTable, people }: {
  eventId: string;
  registrationId: string;
  original: SubstitutionOriginal;
  hasGroup: boolean;
  hasParty: boolean;
  hasTable: boolean;
  targetTable: TargetTableCapacity | null;
  people: SubstitutionPerson[];
}) {
  const [state, action] = useActionState(substituteGuest, initial);
  const [mode, setMode] = useState<"existing" | "new">(people.length ? "existing" : "new");
  const [carryGroup, setCarryGroup] = useState(true);
  const [carryParty, setCarryParty] = useState(true);
  const [carryTable, setCarryTable] = useState(true);
  const [override, setOverride] = useState(false);

  const preview = buildSubstitutionPreview(
    original,
    { carryGroup: hasGroup && carryGroup, carryParty: hasParty && carryParty, carryTable: hasTable && carryTable },
    targetTable,
    override,
  );

  return <form action={action} className="form-card substitution-form">
    <input type="hidden" name="eventId" value={eventId} />
    <input type="hidden" name="registrationId" value={registrationId} />
    <input type="hidden" name="mode" value={mode} />
    {state.error && <div className="alert" role="alert">{state.error}</div>}

    <h2>Replacement guest</h2>
    <div className="segmented">
      <label className={`choice ${mode === "existing" ? "is-active" : ""}`}><input type="radio" name="modeChoice" checked={mode === "existing"} onChange={() => setMode("existing")} disabled={!people.length} /> Existing person</label>
      <label className={`choice ${mode === "new" ? "is-active" : ""}`}><input type="radio" name="modeChoice" checked={mode === "new"} onChange={() => setMode("new")} /> New person</label>
    </div>

    {mode === "existing"
      ? <label>Choose a person<select name="existingPersonId" defaultValue="">
          <option value="" disabled>Select a person…</option>
          {people.map((person) => <option key={person.id} value={person.id}>{person.name}{person.detail ? ` · ${person.detail}` : ""}</option>)}
        </select></label>
      : <div className="field-row-full">
          <div className="field-row"><label>First name<input name="firstName" /></label><label>Last name<input name="lastName" /></label></div>
          <div className="field-row"><label>Email<input name="email" type="email" /></label><label>Phone<input name="phone" type="tel" /></label></div>
        </div>}

    <fieldset><legend>Carry forward</legend>
      {hasGroup && <label className="choice"><input type="checkbox" name="carryGroup" checked={carryGroup} onChange={(e) => setCarryGroup(e.target.checked)} /> Group — {original.groupName}</label>}
      {hasParty && <label className="choice"><input type="checkbox" name="carryParty" checked={carryParty} onChange={(e) => setCarryParty(e.target.checked)} /> Party — {original.partyName}</label>}
      {hasTable && <label className="choice"><input type="checkbox" name="carryTable" checked={carryTable} onChange={(e) => setCarryTable(e.target.checked)} /> Table — {original.tableName}</label>}
      {!hasGroup && !hasParty && !hasTable && <p className="form-hint">This registration has no Group, Party, or Table assignments to carry.</p>}
      <label className="choice"><input type="checkbox" name="overrideCapacity" checked={override} onChange={(e) => setOverride(e.target.checked)} /> Allow an over-capacity table seat</label>
    </fieldset>

    <div className="substitution-preview">
      <h3>What will transfer</h3>
      {preview.transfers.length === 0 ? <p className="form-hint">Nothing will carry forward — the replacement starts with a clean registration.</p>
        : <ul className="transfer-list">{preview.transfers.map((transfer) => <li key={transfer.label}><strong>{transfer.label}</strong> · {transfer.value}</li>)}</ul>}
      {preview.warnings.length > 0 && <ul className="substitution-warnings">{preview.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
      <p className="form-hint">{original.personName}&apos;s registration is superseded (kept for the audit trail), not deleted.</p>
    </div>

    <SubmitButton pendingText="Substituting…">Confirm substitution</SubmitButton>
  </form>;
}
