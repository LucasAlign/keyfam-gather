"use client";

import { useActionState, useMemo, useState } from "react";
import { importRegistrations, type ImportActionState } from "@/app/import-actions";
import { SubmitButton } from "@/components/submit-button";
import { autoMapColumns, buildImportRows, type ColumnMapping, type ImportFieldKey, parseCsvTable, REGISTRATION_IMPORT_FIELDS, requiredFieldsMapped, summarizeImportRows } from "@/lib/csv-import";

const initial: ImportActionState = {};
const PREVIEW_LIMIT = 100;

export function RegistrationImportForm({ eventId }: { eventId: string }) {
  const [state, action] = useActionState(importRegistrations, initial);
  const [csv, setCsv] = useState("");
  const [mapping, setMapping] = useState<ColumnMapping>({});

  const table = useMemo(() => parseCsvTable(csv), [csv]);
  const rows = useMemo(() => buildImportRows(table.rows, mapping), [table.rows, mapping]);
  const summary = useMemo(() => summarizeImportRows(rows), [rows]);
  const ready = requiredFieldsMapped(mapping) && summary.ready > 0;

  const loadText = (text: string) => {
    setCsv(text);
    const parsed = parseCsvTable(text);
    setMapping(parsed.headers.length ? autoMapColumns(parsed.headers) : {});
  };
  const setColumn = (field: ImportFieldKey, value: string) => {
    setMapping((current) => {
      const next = { ...current };
      if (value === "") delete next[field];
      else next[field] = Number(value);
      return next;
    });
  };

  const badge = (row: (typeof rows)[number]) => row.errors.length ? "Error" : row.duplicateInFile ? "Skip" : "Ready";

  return <div className="import-layout">
    <form action={action} className="form-card import-form">
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="csv" value={csv} />
      <input type="hidden" name="mapping" value={JSON.stringify(mapping)} />
      {state.error && <div className="alert" role="alert">{state.error}</div>}

      <h2>1 · Paste or upload a CSV</h2>
      <p className="form-hint">Include a header row. A first and last name plus an email or phone are required per person; Group, Party, and Table columns are matched by name.</p>
      <label>CSV file<input type="file" accept=".csv,text/csv" onChange={(event) => { const file = event.target.files?.[0]; if (file) file.text().then(loadText); }} /></label>
      <label>Or paste CSV<textarea rows={6} value={csv} onChange={(event) => loadText(event.target.value)} placeholder="first,last,email,phone,group,table&#10;Ada,Lovelace,ada@example.test,,Table 1 hosts,Table 1" /></label>

      {table.headers.length > 0 && <>
        <h2>2 · Map columns</h2>
        <div className="import-mapping">{REGISTRATION_IMPORT_FIELDS.map((field) => <label key={field.key}>{field.label}{field.required && <span className="req"> *</span>}
          <select value={mapping[field.key] ?? ""} onChange={(event) => setColumn(field.key, event.target.value)}>
            <option value="">— not mapped —</option>
            {table.headers.map((header, index) => <option key={index} value={index}>{header || `Column ${index + 1}`}</option>)}
          </select>
        </label>)}</div>
        {!requiredFieldsMapped(mapping) && <p className="preview-warning">Map both First name and Last name to continue.</p>}

        <fieldset><legend>Possible duplicate People</legend>
          <label className="choice"><input type="radio" name="duplicatePolicy" value="create-new" defaultChecked /> Create new People for uncertain matches</label>
          <label className="choice"><input type="radio" name="duplicatePolicy" value="reuse-closest" /> Reuse the closest existing Person for uncertain matches</label>
          <p className="form-hint">Exact email or phone matches always reuse the existing Person and skip anyone already registered.</p>
        </fieldset>

        <h2>3 · Review {summary.total} rows</h2>
        <div className="import-summary"><span className="ok-text">{summary.ready} ready</span><span>{summary.duplicatesInFile} in-file duplicates</span><span className={summary.withErrors ? "issue-text" : ""}>{summary.withErrors} with errors</span></div>
        <div className="import-preview"><table><thead><tr><th>Row</th><th>Status</th><th>Name</th><th>Contact</th><th>Assignment</th><th>Issue</th></tr></thead>
          <tbody>{rows.slice(0, PREVIEW_LIMIT).map((row) => <tr key={row.index} className={`status-${badge(row).toLowerCase()}`}>
            <td>{row.index + 2}</td>
            <td>{badge(row)}</td>
            <td>{[row.values.firstName, row.values.lastName].filter(Boolean).join(" ") || "—"}</td>
            <td>{row.values.email || row.values.phone || "—"}</td>
            <td>{[row.values.group, row.values.party, row.values.table].filter(Boolean).join(" · ") || "—"}</td>
            <td>{row.errors.join(" ") || (row.duplicateInFile ? "Duplicate in file" : "")}</td>
          </tr>)}</tbody></table>
          {rows.length > PREVIEW_LIMIT && <p className="form-hint">Showing the first {PREVIEW_LIMIT} of {rows.length} rows. All rows are imported.</p>}
        </div>

        <SubmitButton pendingText="Importing…" disabled={!ready}>Import {summary.ready} {summary.ready === 1 ? "registrant" : "registrants"}</SubmitButton>
        <p className="form-hint">Rows with errors are skipped; re-running the same file is safe — already-registered People are left unchanged.</p>
      </>}
    </form>

    {state.summary && <aside className="form-card import-results">
      <h2>Import complete</h2>
      <div className="import-summary">
        <span className="ok-text">{state.summary.created} created</span>
        <span>{state.summary.reused} reused</span>
        <span>{state.summary.reactivated} reactivated</span>
        <span>{state.summary.skipped} skipped</span>
        <span className={state.summary.errors ? "issue-text" : ""}>{state.summary.errors} errors</span>
      </div>
      {state.outcomes && state.outcomes.some((outcome) => outcome.status === "error") && <div className="import-preview"><table><thead><tr><th>Row</th><th>Name</th><th>Problem</th></tr></thead>
        <tbody>{state.outcomes.filter((outcome) => outcome.status === "error").map((outcome) => <tr key={outcome.row} className="status-error"><td>{outcome.row}</td><td>{outcome.name}</td><td>{outcome.message}</td></tr>)}</tbody></table></div>}
      <p className="form-hint">Fix the flagged rows in your spreadsheet and re-import — successful rows won&apos;t be duplicated.</p>
    </aside>}
  </div>;
}
