# Vertical 6 implementation plan: Offline Resilience

Status: ready to execute after PostgreSQL migration and concurrency verification

## Gate before implementation

After reboot:

1. Start Docker Desktop and wait for `docker version` to report a server.
2. Run `npm run db:up`, `npm run db:deploy`, `npm run db:seed`, and `npx prisma migrate status`.
3. Sign in at `/login` and complete the Vertical 1–5 smoke tests in `CURRENT_HANDOFF.md`.
4. Exercise simultaneous check-in, undo, seating, host-capacity, and walk-in-capacity requests against PostgreSQL. Confirm one canonical check-in and no unapproved capacity overage.
5. Fix any migration or concurrency defect before continuing. Do not weaken PostgreSQL constraints or revert to SQLite.

## Current check-in contract review

The server currently accepts `{ eventId, registrationId, deviceId }` through separate `checkInRegistration` and `undoCheckIn` server actions. It authorizes `checkin:manage` for the event and keeps one durable `CheckIn` row per registration. Check-in creates or reactivates that row; undo sets reversal fields; both write audit records transactionally.

Useful invariants to preserve:

- PostgreSQL and server authorization are authoritative.
- `CheckIn.registrationId` is unique.
- Every lookup includes organization and event scope.
- Reversal never deletes attendance history.
- An active check-in is `reversedAt === null`.
- Undo is permitted for 15 minutes.
- Device and actor attribution are audited.

Gaps that block reliable offline replay:

- No client-generated idempotency key exists, so retries cannot distinguish replay from a new intent.
- Results are presentation strings rather than a stable machine-readable result union.
- Check-in and undo are separate mutation paths rather than one ordered attendance-command contract.
- A duplicate check-in is mostly inferred from `P2002`; the response does not always include canonical state.
- Undo has no expected/base state, so a delayed offline undo cannot identify what check-in it intended to reverse.
- Undo eligibility currently uses server receipt time. Offline intent time needs an explicit, auditable policy.
- `router.refresh()` is the only convergence mechanism and cannot operate offline.
- The workspace receives a server-rendered snapshot but does not persist the minimum searchable dataset.
- `localStorage` stores only the station ID; there is no durable queue or recovery protocol.
- The four-second refresh does not explicitly distinguish offline, retrying, synchronized, or conflicted state.

## Chosen module and seam

Create one deep attendance synchronization module. Its external interface is intentionally small:

```ts
type AttendanceCommand = {
  operationId: string;
  eventId: string;
  registrationId: string;
  deviceId: string;
  kind: "CHECK_IN" | "UNDO";
  occurredAt: string;
  expectedVersion: number | null;
};

type AttendanceResult = {
  operationId: string;
  disposition: "APPLIED" | "ALREADY_APPLIED" | "CONFLICT" | "REJECTED";
  canonical: AttendanceState;
  code?: "ALREADY_CHECKED_IN" | "ALREADY_REVERSED" | "UNDO_EXPIRED" | "STALE_VERSION" | "NOT_FOUND" | "FORBIDDEN";
};

applyAttendanceCommands(commands: AttendanceCommand[]): Promise<AttendanceResult[]>;
```

The module hides authorization, tenant/event validation, ordering, idempotency lookup, optimistic-state comparison, check-in/reversal mutation, audit creation, canonical response construction, and transaction retry behavior.

Use two adapters at the browser persistence seam:

- IndexedDB adapter in production, namespaced by authenticated user and event.
- In-memory adapter for deterministic queue tests.

Do not expose IndexedDB mechanics to React components. Do not introduce a service worker in this vertical: offline navigation and background sync are separate concerns; the required workflow is resilience after the already-open check-in workspace loses connectivity.

## Data model and migration

Add `AttendanceOperation`:

- `id` — server identifier.
- `operationId` — client UUID, globally unique.
- `organizationId`, `eventId`, `registrationId`, `actorId`, `deviceId`.
- `kind` — `CHECK_IN` or `UNDO`.
- `occurredAt` — client intent timestamp for audit/display only.
- `expectedVersion` — state observed by the device.
- `disposition`, `resultCode`, and serialized canonical result.
- `createdAt`.

Add an integer `version` to `CheckIn`, incremented on every applied check-in/reactivation/reversal. Add indexes for event/device diagnostics. Keep `CheckIn.registrationId` unique.

Database invariants:

- Unique `AttendanceOperation.operationId` provides retry idempotency.
- The operation row and any CheckIn/AuditLog mutation commit in one transaction.
- Reusing an operation ID with different command fields is rejected, not replayed.
- Authorization and registration ownership are revalidated on every delivery, including duplicates.
- Tenant IDs are derived from the event and authenticated actor, never trusted from the browser.

## Conflict policy

Commands are processed in device queue order. A batch returns one result for each command and does not hide partial success.

- Same operation delivered again: return the stored canonical result as `ALREADY_APPLIED` without another audit or mutation.
- Check-in when canonical state is already active: no mutation; return `CONFLICT/ALREADY_CHECKED_IN` plus who/when/device.
- Undo requires the `expectedVersion` of the active check-in the device saw. If the row is absent, reversed, re-checked-in, or has another version: return `CONFLICT/STALE_VERSION` or `ALREADY_REVERSED` with canonical state.
- The 15-minute undo window is evaluated against the canonical `checkedInAt` and server processing time. `occurredAt` is not authority because a client clock and an offline queue are untrusted. The UI must warn that an offline undo can expire before synchronization.
- A later command for the same registration continues after a conflict only when its own precondition can be evaluated safely; every result remains visible until acknowledged.
- Transport/server failures leave the current and remaining commands queued. Domain conflicts are terminal results and are removed from the retry queue after being recorded for the operator.

## Cached browser state

Use IndexedDB schema version 1 with stores:

- `eventSnapshots`: event ID, snapshot revision/fetched time, and minimal registrant records.
- `operations`: full attendance command, sequence number, status, attempt count, last error.
- `conflicts`: terminal result plus canonical state until operator acknowledgment.

Minimum searchable registrant record:

- registration ID; display name; email; phone; group/table/party labels.
- canonical attendance state: active/reversed, checked-in time, actor label, device suffix, version.

Do not cache permissions beyond display hints. The server reauthorizes every command. Do not cache walk-in creation in Vertical 6; walk-ins remain online-only because canonical-person matching and capacity decisions need current server state.

## Client behavior

Replace per-row server-action forms with a workspace controller backed by the synchronization module:

1. On initial render, merge the server snapshot into IndexedDB and render it.
2. On check-in/undo, create a UUID command, persist it before changing the UI, then apply an optimistic derived state.
3. Display explicit `Online`, `Offline`, `Synchronizing`, and `Attention needed` state plus unsynced count.
4. Treat `navigator.onLine` only as a hint. A successful request establishes online state; network failure establishes offline state.
5. Synchronize one ordered batch at a time on startup, `online`, visibility regain, and bounded retry with jitter.
6. Merge every canonical response into the snapshot, then delete the acknowledged queued command in the same IndexedDB transaction.
7. Pause four-second refresh while offline or synchronizing. Online refresh merges canonical state without deleting queued intent.
8. Preserve the queue across reload/browser restart. Never silently discard an operation.

## Implementation sequence (small commits)

1. **Verify Verticals 1–5 on PostgreSQL.** Add integration coverage for check-in concurrency and serializable capacity operations; fix failures.
2. **Add attendance operation schema.** Migration, Prisma model/enum, `CheckIn.version`, migration SQL review, deploy to the live local database.
3. **Define contract types and pure state transitions.** Command/result union, canonical state serializer, precondition/conflict tests.
4. **Build the server attendance module.** One command processor with transactionally stored idempotency results, event-scoped authorization, audit writes, and canonical responses.
5. **Adapt existing online actions.** Make current check-in and undo callers use the module before changing the UI; retain behavior while eliminating the old mutation duplication.
6. **Add a batch route.** `POST /events/[eventId]/check-in/sync` (or equivalent route handler) validates a bounded ordered array, returns per-command results, disables caching, and never accepts browser tenant/actor claims.
7. **Add the local queue module.** IndexedDB and in-memory adapters, schema upgrade/recovery, atomic enqueue/ack/conflict operations.
8. **Add synchronization orchestration.** Single-flight ordered batching, retry/backoff, partial failure, reload recovery, online hints, and canonical snapshot merging.
9. **Integrate the workspace.** Offline search snapshot, optimistic state, connectivity banner, unsynced count, conflict presentation, manual retry, and online-only walk-in messaging.
10. **Verify and document.** Full unit/integration/browser matrix, architecture/handoff updates, migration status, build, lint, types, and `git diff --check`.

## Required tests

Server/module tests:

- Same operation ID delivered twice mutates and audits once.
- Same operation ID with altered payload is rejected.
- Concurrent distinct check-in operations converge on one active CheckIn.
- Check-in against active state returns canonical conflict details.
- Undo succeeds only for the expected active version within the server-time window.
- Delayed, reordered, duplicate, and re-check-in/undo sequences converge deterministically.
- Batch partial failure reports applied prefix and leaves retryable suffix unacknowledged.
- Cross-event, cross-organization, unassigned-event, and unauthenticated delivery is rejected.

Queue/synchronizer tests through the module interface:

- Enqueue persists before optimistic display.
- Reload and browser restart recover queue order.
- Network loss retains commands and increments no false acknowledgments.
- Retry uses identical operation IDs.
- Partial response acknowledges only returned operations.
- Conflict becomes terminal and remains visible until acknowledged.
- New server snapshot merges without erasing pending local intent.
- Corrupt/old IndexedDB schema fails safely with recovery guidance, not silent loss.

Browser smoke tests:

- Load event, disconnect network, search cached registrants, queue check-ins and a permitted undo.
- Reload while offline and confirm queue/search recovery.
- Reconnect and confirm ordered synchronization and zero unsynced actions.
- Cause another station to check in/reverse the same registration and confirm clear canonical conflict behavior.
- Confirm walk-in remains visibly online-only.
- Confirm event staff cannot sync commands for another event and cannot access walk-in controls.

## Completion criteria

Vertical 6 is complete only when migrations apply cleanly to PostgreSQL; all duplicate/reordering/partial-failure/conflict/tenant tests pass; an already-open workspace works through disconnect, reload, and reconnect; every queued command reaches an applied or visible terminal state; and connected stations converge to the server’s canonical attendance state.
