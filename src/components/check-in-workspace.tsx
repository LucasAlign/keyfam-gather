"use client";

import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { addAndCheckInWalkIn, type ActionState } from "@/app/actions";
import { matchesCheckInSearch } from "@/lib/check-in";
import { IndexedDbAttendanceQueue, synchronizeAttendance, type AttendanceConflict, type AttendanceQueueStore } from "@/lib/attendance-queue";
import { applyPendingAttendance, mergeAttendanceResults, type AttendanceRegistrant, type AttendanceSnapshot } from "@/lib/attendance-snapshot";
import type { AttendanceCommand, AttendanceResult } from "@/lib/attendance-contract";
import { SubmitButton } from "@/components/submit-button";

export type CheckInRegistrant = AttendanceRegistrant;
type NamedOption = { id: string; name: string; detail?: string };
type ConnectionState = "online" | "offline" | "syncing" | "attention";

type QrScanStatus = { kind: "idle" | "pending" | "error" | "success"; message?: string };

function QrCheckInPanel({ eventId, online, registrants, onResolved }: { eventId: string; online: boolean; registrants: CheckInRegistrant[]; onResolved: (registrant: CheckInRegistrant) => void }) {
  const [tokenInput, setTokenInput] = useState("");
  const [status, setStatus] = useState<QrScanStatus>({ kind: "idle" });
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef(0);
  const registrantsRef = useRef(registrants);
  useEffect(() => { registrantsRef.current = registrants; }, [registrants]);
  const supportsCameraScan = typeof window !== "undefined" && "BarcodeDetector" in window && Boolean(navigator.mediaDevices?.getUserMedia);

  const stopScan = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setScanning(false);
  }, []);

  const resolveToken = useCallback(async (rawToken: string) => {
    const trimmed = rawToken.trim();
    if (!trimmed) return;
    setStatus({ kind: "pending" });
    try {
      const response = await fetch(`/events/${eventId}/check-in/qr`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: trimmed }), cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setStatus({ kind: "error", message: body.error ?? "That QR code could not be used." }); return; }
      const registrant = registrantsRef.current.find((item) => item.id === body.registrationId);
      if (!registrant) { setStatus({ kind: "error", message: "That guest is not in this event's check-in list." }); return; }
      onResolved(registrant);
      setStatus({ kind: "success", message: registrant.checkIn ? `${registrant.name} is already checked in.` : `${registrant.name} checked in.` });
    } catch {
      setStatus({ kind: "error", message: "That QR code could not be reached. Check your connection." });
    }
    setTokenInput("");
  }, [eventId, onResolved]);

  const startScan = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      setScanning(true);
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      const BarcodeDetectorCtor = (window as unknown as { BarcodeDetector: new (options: { formats: string[] }) => { detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]> } }).BarcodeDetector;
      const detector = new BarcodeDetectorCtor({ formats: ["qr_code"] });
      const tick = async () => {
        if (!videoRef.current || !streamRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes[0]?.rawValue) { stopScan(); await resolveToken(codes[0].rawValue); return; }
        } catch { /* transient decode failure; keep scanning */ }
        rafRef.current = requestAnimationFrame(() => void tick());
      };
      rafRef.current = requestAnimationFrame(() => void tick());
    } catch {
      setStatus({ kind: "error", message: "Camera access was not available. Enter the code instead." });
    }
  }, [resolveToken, stopScan]);

  useEffect(() => () => stopScan(), [stopScan]);

  return <details className="qr-panel"><summary>Scan or enter a QR code {!online && <span className="optional">— online only</span>}</summary><div className="qr-form">
    {!online && <div className="alert" role="alert">QR check-in needs a live connection to resolve the code.</div>}
    {status.kind === "error" && <div className="alert" role="alert">{status.message}</div>}
    {status.kind === "success" && <div className="success" role="status">{status.message}</div>}
    <form onSubmit={(event) => { event.preventDefault(); void resolveToken(tokenInput); }}>
      <label>Scan with a handheld scanner or paste the code<input value={tokenInput} onChange={(event) => setTokenInput(event.target.value)} placeholder="Scan or paste QR code" disabled={!online} autoComplete="off" /></label>
      <button className="button" type="submit" disabled={!online || status.kind === "pending"}>{status.kind === "pending" ? "Checking…" : "Use code"}</button>
    </form>
    {supportsCameraScan && <div className="qr-camera">
      {!scanning
        ? <button className="button secondary" type="button" onClick={() => void startScan()} disabled={!online}>Scan with camera</button>
        : <><video ref={videoRef} muted playsInline className="qr-video" /><button className="button secondary" type="button" onClick={stopScan}>Stop scanning</button></>}
    </div>}
  </div></details>;
}

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
  const [storageError, setStorageError] = useState<string | null>(null);
  const [storeReady, setStoreReady] = useState(false);
  const storeRef = useRef<AttendanceQueueStore<AttendanceSnapshot> | null>(null);
  const syncingRef = useRef(false);
  const serverRegistrantsRef = useRef(serverRegistrants);
  const appliedServerRegistrantsRef = useRef<CheckInRegistrant[] | null>(null);
  useEffect(() => { serverRegistrantsRef.current = serverRegistrants; }, [serverRegistrants]);

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
      let store: AttendanceQueueStore<AttendanceSnapshot>;
      try { store = await IndexedDbAttendanceQueue.open<AttendanceSnapshot>(`${userId}-${eventId}`, eventId); }
      catch (error) {
        if (active) { setStorageError(error instanceof Error ? error.message : "Offline attendance storage is unavailable."); setConnection("attention"); }
        return;
      }
      if (!active) return;
      storeRef.current = store;
      const cached = await store.loadSnapshot();
      if (cached) applySnapshot(cached);
      const initialRegistrants = serverRegistrantsRef.current;
      const serverSnapshot = { eventId, fetchedAt: new Date().toISOString(), registrants: initialRegistrants };
      await store.saveSnapshot(serverSnapshot);
      applySnapshot(applyPendingAttendance(serverSnapshot, await store.pending()));
      appliedServerRegistrantsRef.current = initialRegistrants;
      setStoreReady(true);
      await refreshCounts(); await sync();
    })();
    return () => { active = false; storeRef.current?.close(); storeRef.current = null; };
  }, [applySnapshot, eventId, refreshCounts, sync, userId]);

  useEffect(() => {
    const store = storeRef.current;
    if (!storeReady || !store || appliedServerRegistrantsRef.current === serverRegistrants) return;
    appliedServerRegistrantsRef.current = serverRegistrants;
    void (async () => {
      const serverSnapshot = { eventId, fetchedAt: new Date().toISOString(), registrants: serverRegistrants };
      await store.saveSnapshot(serverSnapshot);
      applySnapshot(applyPendingAttendance(serverSnapshot, await store.pending()));
    })().catch((error) => {
      setStorageError(error instanceof Error ? error.message : "Attendance refresh could not be stored.");
      setConnection("attention");
    });
  }, [applySnapshot, eventId, serverRegistrants, storeReady]);

  useEffect(() => {
    const online = () => void sync();
    const offline = () => setConnection("offline");
    const visible = () => { if (document.visibilityState === "visible") void sync(); };
    window.addEventListener("online", online); window.addEventListener("offline", offline); document.addEventListener("visibilitychange", visible);
    const retry = window.setInterval(() => void sync(), 8000);
    return () => { window.removeEventListener("online", online); window.removeEventListener("offline", offline); document.removeEventListener("visibilitychange", visible); window.clearInterval(retry); };
  }, [sync]);

  useEffect(() => { if (connection !== "online" || unsynced) return; const timer = window.setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, 4000); return () => window.clearInterval(timer); }, [connection, router, unsynced]);

  const enqueueCommand = async (registrant: CheckInRegistrant, kind: "CHECK_IN" | "UNDO") => {
    const store = storeRef.current; if (!store) return;
    const command: AttendanceCommand = { operationId: crypto.randomUUID(), eventId, registrationId: registrant.id, deviceId, kind, occurredAt: new Date().toISOString(), expectedVersion: kind === "UNDO" ? registrant.attendanceVersion : null };
    await store.enqueue(command);
    const optimisticVersion = registrant.attendanceVersion + 1;
    setRegistrants((items) => items.map((item) => item.id !== registrant.id ? item : { ...item, attendanceVersion: optimisticVersion, checkIn: kind === "CHECK_IN" ? { checkedInAt: command.occurredAt, actor: "Pending sync", deviceId, version: optimisticVersion } : null }));
    await refreshCounts(); void sync();
  };
  const queue = (registrant: CheckInRegistrant) => enqueueCommand(registrant, registrant.checkIn ? "UNDO" : "CHECK_IN");
  // QR scans always drive a CHECK_IN command, never UNDO: the same registrant
  // may be scanned twice, and the attendance contract's idempotent
  // ALREADY_CHECKED_IN handling — not a client-side toggle — is what must
  // decide the outcome. Already-checked-in guests are skipped locally so a
  // repeat scan does not enqueue a redundant command.
  const checkInFromQr = (registrant: CheckInRegistrant) => { if (!registrant.checkIn) void enqueueCommand(registrant, "CHECK_IN"); };

  const dismissConflict = async (operationId: string) => { await storeRef.current?.clearConflict(operationId); await refreshCounts(); if ((await storeRef.current?.conflicts())?.length === 0) setConnection(navigator.onLine ? "online" : "offline"); };
  const results = useMemo(() => registrants.filter((item) => matchesCheckInSearch([item.name, item.email, item.phone, item.group, item.table, item.party].filter(Boolean).join(" "), query)), [registrants, query]);
  const labels: Record<ConnectionState, string> = { online: "Online", offline: "Offline", syncing: "Synchronizing", attention: "Attention needed" };

  return <>
    <section className={`sync-status ${connection}`} role="status"><strong>{labels[connection]}</strong><span>{unsynced} unsynced {unsynced === 1 ? "action" : "actions"}</span>{connection === "offline" && <button className="button secondary" onClick={() => void sync()}>Retry</button>}</section>
    {storageError && <div className="alert" role="alert">{storageError}</div>}
    {connection === "offline" && <div className="alert" role="status">Offline undo requests can expire before they synchronize. Reconnect within 15 minutes of the original check-in.</div>}
    {conflicts.map(({ result: item }) => <div className="alert conflict" role="alert" key={item.operationId}><span>{item.code?.replaceAll("_", " ") ?? "Attendance conflict"}. The server’s attendance state is shown.</span><button onClick={() => void dismissConflict(item.operationId)}>Dismiss</button></div>)}
    {canManageWalkIns && <WalkInForm eventId={eventId} deviceId={deviceId} groups={groups} tables={tables} online={connection === "online"} />}
    <QrCheckInPanel eventId={eventId} online={connection === "online"} registrants={registrants} onResolved={checkInFromQr} />
    <label className="checkin-search">Search registrants<input autoFocus type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, email, phone, group, table, or party" autoComplete="off" /><span>{results.length} {results.length === 1 ? "result" : "results"}</span></label>
    {registrants.length === 0 ? <div className="empty compact"><h2>No registrants yet</h2><p>Add registrants before opening check-in.</p></div> : results.length === 0 ? <div className="empty compact"><h2>No matches</h2><p>Try part of a name, phone number, group, or table.</p></div> : <div className="checkin-results">{results.map((registrant) => <article key={registrant.id} className={registrant.checkIn ? "is-checked-in" : ""}>
      <div className="avatar">{registrant.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</div><div className="checkin-person"><strong>{registrant.name}</strong><p>{[registrant.group, registrant.table, registrant.party].filter(Boolean).join(" · ") || "No group or seating assignment"}</p><small>{registrant.email ?? registrant.phone ?? "No contact details"}</small></div>
      <div className="checkin-status">{registrant.checkIn ? <><strong>Checked in</strong><span>{new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(registrant.checkIn.checkedInAt))} by {registrant.checkIn.actor}<br />Station {registrant.checkIn.deviceId.slice(-8)}</span></> : <span>Not arrived</span>}</div>
      <div className="checkin-action"><button className="button" onClick={() => void queue(registrant)}>{registrant.checkIn ? "Undo" : "Check in"}</button></div>
    </article>)}</div>}
  </>;
}
