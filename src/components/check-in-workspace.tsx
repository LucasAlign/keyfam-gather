"use client";

import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { addAndCheckInWalkIn, type ActionState } from "@/app/actions";
import { matchesCheckInSearch } from "@/lib/check-in";
import { IndexedDbAttendanceQueue, synchronizeAttendance, type AttendanceConflict, type AttendanceQueueStore } from "@/lib/attendance-queue";
import { mergeAttendanceResults, type AttendanceRegistrant, type AttendanceSnapshot } from "@/lib/attendance-snapshot";
import type { AttendanceCommand, AttendanceResult } from "@/lib/attendance-contract";
import { SubmitButton } from "@/components/submit-button";

export type CheckInRegistrant = AttendanceRegistrant;
type NamedOption = { id: string; name: string; detail?: string };
type ConnectionState = "online" | "offline" | "syncing" | "attention";

function WalkInForm({ eventId, deviceId, groups, tables, online }: { eventId: string; deviceId: string; groups: NamedOption[]; tables: NamedOption[]; online: boolean }) {
  const [state, action] = useActionState(addAndCheckInWalkIn, {} as ActionState);
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.success) { formRef.current?.reset(); router.refresh(); } }, [state.success, router]);
  const error = (name: string) => state.fields?.[name]?.[0];
  return <details className="walkin-panel"><summary>Add a walk-in {!online && <span className="optional">— online only</span>}</summary><form ref={formRef} action={action} className="walkin-form">
    <input type="hidden" name="eventId" value={eventId} /><input type="hidden" name="deviceId" value={deviceId} />
    {!online && <div className="alert" role="alert">Walk-ins need a live connection for identity and capacity checks.</div>}
    {state.error && <div className="alert" role="alert">{state.error}</div>}{state.success && <div className="success" role="status">{state.success}</div>}
    <div className="field-row"><label>First name<input name="firstName" required autoComplete="given-name" disabled={!online} />{error("firstName") && <small>{error("firstName")}</small>}</label><label>Last name<input name="lastName" required autoComplete="family-name" disabled={!online} />{error("lastName") && <small>{error("lastName")}</small>}</label></div>
    <div className="field-row"><label>Email <span className="optional">Optional</span><input name="email" type="email" autoComplete="email" disabled={!online} /></label><label>Phone <span className="optional">Optional</span><input name="phone" type="tel" autoComplete="tel" disabled={!online} /></label></div>
    <div className="field-row"><label>Group <span className="optional">Optional</span><select name="groupId" defaultValue="" disabled={!online}><option value="">No group</option>{groups.map((item) => <option key={item.id} value={item.id}>{item.name}{item.detail ? ` — ${item.detail}` : ""}</option>)}</select></label><label>Table <span className="optional">Optional</span><select name="tableId" defaultValue="" disabled={!online}><option value="">Unassigned</option>{tables.map((item) => <option key={item.id} value={item.id}>{item.name}{item.detail ? ` — ${item.detail}` : ""}</option>)}</select></label></div>
    <label className="choice override"><input type="checkbox" name="overrideCapacity" disabled={!online} /> Allow an over-capacity table assignment</label>
    <SubmitButton pendingText="Adding & checking in…" disabled={!online}>Add & check in</SubmitButton>
  </form></details>;
}

export function CheckInWorkspace({ eventId, userId, registrants: serverRegistrants, canManageWalkIns, groups, tables }: { eventId: string; userId: string; registrants: CheckInRegistrant[]; canManageWalkIns: boolean; groups: NamedOption[]; tables: NamedOption[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [deviceId, setDeviceId] = useState("browser-station");
  const [registrants, setRegistrants] = useState(serverRegistrants);
  const [connection, setConnection] = useState<ConnectionState>("online");
  const [unsynced, setUnsynced] = useState(0);
  const [conflicts, setConflicts] = useState<AttendanceConflict[]>([]);
  const storeRef = useRef<AttendanceQueueStore<AttendanceSnapshot> | null>(null);
  const syncingRef = useRef(false);

  const applySnapshot = useCallback((snapshot: AttendanceSnapshot) => setRegistrants(snapshot.registrants), []);
  const refreshCounts = useCallback(async () => {
    if (!storeRef.current) return;
    setUnsynced((await storeRef.current.pending()).length);
    const terminal = await storeRef.current.conflicts(); setConflicts(terminal);
    if (terminal.length) setConnection("attention");
  }, []);

  const sync = useCallback(async () => {
    const store = storeRef.current;
    if (!store || syncingRef.current) return;
    const pending = await store.pending();
    if (!pending.length) { setConnection(navigator.onLine ? "online" : "offline"); return; }
    syncingRef.current = true; setConnection("syncing");
    try {
      const outcome = await synchronizeAttendance(store, async (commands) => {
        const response = await fetch(`/events/${eventId}/check-in/sync`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(commands), cache: "no-store" });
        if (!response.ok) throw new Error(`Synchronization failed (${response.status}).`);
        return (await response.json() as { results: AttendanceResult[] }).results;
      }, mergeAttendanceResults);
      if (outcome.snapshot) applySnapshot(outcome.snapshot);
      setConnection("online");
    } catch { setConnection("offline"); }
    finally { syncingRef.current = false; await refreshCounts(); }
  }, [applySnapshot, eventId, refreshCounts]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const key = "gather-check-in-device";
      let id = window.localStorage.getItem(key);
      if (!id) { id = `station-${crypto.randomUUID()}`; window.localStorage.setItem(key, id); }
      setDeviceId(id);
      const store = await IndexedDbAttendanceQueue.open<AttendanceSnapshot>(`${userId}-${eventId}`, eventId);
      if (!active) return;
      storeRef.current = store;
      const cached = await store.loadSnapshot();
      if (cached) applySnapshot(cached);
      await store.saveSnapshot({ eventId, fetchedAt: new Date().toISOString(), registrants: serverRegistrants });
      applySnapshot({ eventId, fetchedAt: new Date().toISOString(), registrants: serverRegistrants });
      await refreshCounts(); await sync();
    })();
    return () => { active = false; };
  }, [applySnapshot, eventId, refreshCounts, serverRegistrants, sync, userId]);

  useEffect(() => {
    const online = () => void sync();
    const offline = () => setConnection("offline");
    const visible = () => { if (document.visibilityState === "visible") void sync(); };
    window.addEventListener("online", online); window.addEventListener("offline", offline); document.addEventListener("visibilitychange", visible);
    const retry = window.setInterval(() => void sync(), 8000);
    return () => { window.removeEventListener("online", online); window.removeEventListener("offline", offline); document.removeEventListener("visibilitychange", visible); window.clearInterval(retry); };
  }, [sync]);

  useEffect(() => { if (connection !== "online" || unsynced) return; const timer = window.setInterval(() => router.refresh(), 4000); return () => window.clearInterval(timer); }, [connection, router, unsynced]);

  const queue = async (registrant: CheckInRegistrant) => {
    const store = storeRef.current; if (!store) return;
    const kind = registrant.checkIn ? "UNDO" : "CHECK_IN";
    const command: AttendanceCommand = { operationId: crypto.randomUUID(), eventId, registrationId: registrant.id, deviceId, kind, occurredAt: new Date().toISOString(), expectedVersion: kind === "UNDO" ? registrant.attendanceVersion : null };
    await store.enqueue(command);
    const optimisticVersion = registrant.attendanceVersion + 1;
    setRegistrants((items) => items.map((item) => item.id !== registrant.id ? item : { ...item, attendanceVersion: optimisticVersion, checkIn: kind === "CHECK_IN" ? { checkedInAt: command.occurredAt, actor: "Pending sync", deviceId, version: optimisticVersion } : null }));
    await refreshCounts(); void sync();
  };

  const dismissConflict = async (operationId: string) => { await storeRef.current?.clearConflict(operationId); await refreshCounts(); if ((await storeRef.current?.conflicts())?.length === 0) setConnection(navigator.onLine ? "online" : "offline"); };
  const results = useMemo(() => registrants.filter((item) => matchesCheckInSearch([item.name, item.email, item.phone, item.group, item.table, item.party].filter(Boolean).join(" "), query)), [registrants, query]);
  const labels: Record<ConnectionState, string> = { online: "Online", offline: "Offline", syncing: "Synchronizing", attention: "Attention needed" };

  return <>
    <section className={`sync-status ${connection}`} role="status"><strong>{labels[connection]}</strong><span>{unsynced} unsynced {unsynced === 1 ? "action" : "actions"}</span>{connection === "offline" && <button className="button secondary" onClick={() => void sync()}>Retry</button>}</section>
    {conflicts.map(({ result: item }) => <div className="alert conflict" role="alert" key={item.operationId}><span>{item.code?.replaceAll("_", " ") ?? "Attendance conflict"}. The server’s attendance state is shown.</span><button onClick={() => void dismissConflict(item.operationId)}>Dismiss</button></div>)}
    {canManageWalkIns && <WalkInForm eventId={eventId} deviceId={deviceId} groups={groups} tables={tables} online={connection === "online"} />}
    <label className="checkin-search">Search registrants<input autoFocus type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, email, phone, group, table, or party" autoComplete="off" /><span>{results.length} {results.length === 1 ? "result" : "results"}</span></label>
    {registrants.length === 0 ? <div className="empty compact"><h2>No registrants yet</h2><p>Add registrants before opening check-in.</p></div> : results.length === 0 ? <div className="empty compact"><h2>No matches</h2><p>Try part of a name, phone number, group, or table.</p></div> : <div className="checkin-results">{results.map((registrant) => <article key={registrant.id} className={registrant.checkIn ? "is-checked-in" : ""}>
      <div className="avatar">{registrant.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</div><div className="checkin-person"><strong>{registrant.name}</strong><p>{[registrant.group, registrant.table, registrant.party].filter(Boolean).join(" · ") || "No group or seating assignment"}</p><small>{registrant.email ?? registrant.phone ?? "No contact details"}</small></div>
      <div className="checkin-status">{registrant.checkIn ? <><strong>Checked in</strong><span>{new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(registrant.checkIn.checkedInAt))} by {registrant.checkIn.actor}<br />Station {registrant.checkIn.deviceId.slice(-8)}</span></> : <span>Not arrived</span>}</div>
      <div className="checkin-action"><button className="button" onClick={() => void queue(registrant)}>{registrant.checkIn ? "Undo" : "Check in"}</button></div>
    </article>)}</div>}
  </>;
}
