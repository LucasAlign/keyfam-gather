"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { addAndCheckInWalkIn, checkInRegistration, undoCheckIn, type ActionState } from "@/app/actions";
import { matchesCheckInSearch } from "@/lib/check-in";
import { SubmitButton } from "@/components/submit-button";

export type CheckInRegistrant = {
  id: string; name: string; email: string | null; phone: string | null; group: string | null; table: string | null; party: string | null;
  checkIn: { checkedInAt: string; actor: string; deviceId: string } | null;
};
type NamedOption = { id: string; name: string; detail?: string };

function WalkInForm({ eventId, deviceId, groups, tables }: { eventId: string; deviceId: string; groups: NamedOption[]; tables: NamedOption[] }) {
  const [state, action] = useActionState(addAndCheckInWalkIn, {} as ActionState);
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.success) { formRef.current?.reset(); router.refresh(); } }, [state.success, router]);
  const error = (name: string) => state.fields?.[name]?.[0];
  return <details className="walkin-panel"><summary>Add a walk-in</summary><form ref={formRef} action={action} className="walkin-form">
    <input type="hidden" name="eventId" value={eventId} /><input type="hidden" name="deviceId" value={deviceId} />
    {state.error && <div className="alert" role="alert">{state.error}</div>}{state.success && <div className="success" role="status">{state.success}</div>}
    <div className="field-row"><label>First name<input name="firstName" required autoComplete="given-name" />{error("firstName") && <small>{error("firstName")}</small>}</label><label>Last name<input name="lastName" required autoComplete="family-name" />{error("lastName") && <small>{error("lastName")}</small>}</label></div>
    <div className="field-row"><label>Email <span className="optional">Optional</span><input name="email" type="email" autoComplete="email" />{error("email") && <small>{error("email")}</small>}</label><label>Phone <span className="optional">Optional</span><input name="phone" type="tel" autoComplete="tel" />{error("phone") && <small>{error("phone")}</small>}</label></div>
    <div className="field-row"><label>Group <span className="optional">Optional</span><select name="groupId" defaultValue=""><option value="">No group</option>{groups.map((item) => <option key={item.id} value={item.id}>{item.name}{item.detail ? ` — ${item.detail}` : ""}</option>)}</select></label><label>Table <span className="optional">Optional</span><select name="tableId" defaultValue=""><option value="">Unassigned</option>{tables.map((item) => <option key={item.id} value={item.id}>{item.name}{item.detail ? ` — ${item.detail}` : ""}</option>)}</select></label></div>
    <label className="choice override"><input type="checkbox" name="overrideCapacity" /> Allow an over-capacity table assignment</label>
    <SubmitButton pendingText="Adding & checking in…">Add & check in</SubmitButton>
  </form></details>;
}

function ActionForm({ eventId, registrant, deviceId }: { eventId: string; registrant: CheckInRegistrant; deviceId: string }) {
  const action = registrant.checkIn ? undoCheckIn : checkInRegistration;
  const [state, formAction] = useActionState(action, {} as ActionState);
  const router = useRouter();
  useEffect(() => { if (state.success) router.refresh(); }, [state.success, router]);
  return <form action={formAction} className="checkin-action">
    <input type="hidden" name="eventId" value={eventId} /><input type="hidden" name="registrationId" value={registrant.id} /><input type="hidden" name="deviceId" value={deviceId} />
    {state.error && <small className="inline-error" role="alert">{state.error}</small>}{state.success && <small className="inline-success" role="status">{state.success}</small>}
    <SubmitButton pendingText={registrant.checkIn ? "Undoing…" : "Checking in…"}>{registrant.checkIn ? "Undo" : "Check in"}</SubmitButton>
  </form>;
}

export function CheckInWorkspace({ eventId, registrants, canManageWalkIns, groups, tables }: { eventId: string; registrants: CheckInRegistrant[]; canManageWalkIns: boolean; groups: NamedOption[]; tables: NamedOption[] }) {
  const [query, setQuery] = useState("");
  const [deviceId, setDeviceId] = useState("browser-station");
  useEffect(() => {
    const key = "gather-check-in-device";
    let id = window.localStorage.getItem(key);
    if (!id) { id = `station-${crypto.randomUUID()}`; window.localStorage.setItem(key, id); }
    setDeviceId(id);
  }, []);
  const router = useRouter();
  useEffect(() => { const timer = window.setInterval(() => router.refresh(), 4000); return () => window.clearInterval(timer); }, [router]);
  const results = useMemo(() => registrants.filter((item) => matchesCheckInSearch([item.name, item.email, item.phone, item.group, item.table, item.party].filter(Boolean).join(" "), query)), [registrants, query]);
  return <>
    {canManageWalkIns && <WalkInForm eventId={eventId} deviceId={deviceId} groups={groups} tables={tables} />}
    <label className="checkin-search">Search registrants<input autoFocus type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, email, phone, group, table, or party" autoComplete="off" /><span>{results.length} {results.length === 1 ? "result" : "results"}</span></label>
    {registrants.length === 0 ? <div className="empty compact"><h2>No registrants yet</h2><p>Add registrants before opening check-in.</p></div> : results.length === 0 ? <div className="empty compact"><h2>No matches</h2><p>Try part of a name, phone number, group, or table.</p></div> : <div className="checkin-results">{results.map((registrant) => <article key={registrant.id} className={registrant.checkIn ? "is-checked-in" : ""}>
      <div className="avatar">{registrant.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</div><div className="checkin-person"><strong>{registrant.name}</strong><p>{[registrant.group, registrant.table, registrant.party].filter(Boolean).join(" · ") || "No group or seating assignment"}</p><small>{registrant.email ?? registrant.phone ?? "No contact details"}</small></div>
      <div className="checkin-status">{registrant.checkIn ? <><strong>Checked in</strong><span>{new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(registrant.checkIn.checkedInAt))} by {registrant.checkIn.actor}<br />Station {registrant.checkIn.deviceId.slice(-8)}</span></> : <span>Not arrived</span>}</div>
      <ActionForm eventId={eventId} registrant={registrant} deviceId={deviceId} />
    </article>)}</div>}
  </>;
}
