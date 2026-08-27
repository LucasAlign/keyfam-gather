# Attendance Sync Endpoint — Design Spec (Align Core events module)

> Designs Gather's offline-first check-in sync as an Align Core endpoint,
> reconciled with the **Batch Writes (#265)** contract. Companion to
> [`aligncore-migration-detail.md`](./aligncore-migration-detail.md).
> Source of truth for behavior: `src/lib/attendance.ts`,
> `attendance-contract.ts`, `attendance-snapshot.ts`, and the current
> `check-in/sync/route.ts`.

---

## The core tension (read this first)

Batch Writes (#265) and attendance sync are **opposite shapes**, and conflating
them would break check-in.

| | Batch Writes (#265) | Attendance sync |
|---|---|---|
| Payload | **one** edit applied to **N** rows | **N different** commands |
| Transaction | **all-or-nothing**, single DB tx | **per-command** tx; each independently durable |
| Partial success | **forbidden** (a count would hide the misses) | **required** — the whole point of an offline queue |
| Response | `{ "updated": <count> }` | per-operation `{ disposition, code, canonical }` |
| A rejected row | rolls back the **whole** batch | resolves **that** command only (`CONFLICT`/`REJECTED`) |
| Idempotency | none (re-issuing re-applies) | `operation_id` — replays return `ALREADY_APPLIED` |

A device that captured 40 check-ins offline must not lose 39 because command #40
references a since-cancelled registration. So **attendance sync is NOT a #265
bulk endpoint** — it is a dedicated command-log endpoint that **borrows #265's
transport conventions** (id-array request, cap→`400`, the `400/403/404/429/503`
client-behavior taxonomy, "retry as a batch") while **replacing** its
all-or-nothing body with a per-operation result envelope.

> **What in the events module _should_ use #265:** bulk seating moves, bulk
> registration status changes, bulk invitation send-marking — true "one edit to
> N rows." Attendance is not one of them.

---

## Endpoints

```
POST /events/{event_id}/attendance/sync        # flush a device's command queue
GET  /events/{event_id}/attendance/snapshot    # baseline + version vector for a device
```

- **Auth:** Cognito bearer; capability `checkin:manage`, derived from
  `cognito:groups` ∪ an `event_assignments` row for `{event_id}` (see the
  auth deep-dive, Part A). Check-in is **staff-only** — there is no anonymous
  host/invite token path here, so this endpoint never joins the `/public/*`
  surface.
- **Scope:** every command's `registration_id` must resolve to an `ACTIVE`
  registration under `{event_id}` and the caller's org. Out-of-scope →
  op-level `NOT_FOUND` (not a transport `403`), because a stale offline queue
  legitimately references rows the operator can no longer see.

---

## `POST /events/{event_id}/attendance/sync`

### Request

```json
{
  "commands": [
    {
      "operation_id": "b8f0e5c2-3d4a-4c1e-9b7a-1f2e3d4c5b6a",
      "registration_id": 4821,
      "device_id": "ipad-door-2",
      "kind": "CHECK_IN",
      "occurred_at": "2026-08-18T23:41:07.221Z",
      "expected_version": null
    },
    {
      "operation_id": "6a5b4c3d-2e1f-4a9b-8c7d-0e1f2a3b4c5d",
      "registration_id": 4821,
      "device_id": "ipad-door-2",
      "kind": "UNDO",
      "occurred_at": "2026-08-18T23:41:52.910Z",
      "expected_version": 1
    }
  ]
}
```

| Field | Type | Rules |
|---|---|---|
| `operation_id` | uuid | Client-minted, globally unique. The idempotency key. |
| `registration_id` | int | Must be `ACTIVE` under `{event_id}` + caller org. |
| `device_id` | string(3..160) | Passes #91 free-text normalization. |
| `kind` | enum | `CHECK_IN` \| `UNDO`. |
| `occurred_at` | ISO 8601 | Device wall-clock at capture; strict ISO or `400`. |
| `expected_version` | int(>0) \| null | Optimistic guard. Required-meaningful for `UNDO`; `null` for a first `CHECK_IN`. |

**Cap: 50 commands** (retain Gather's `attendanceBatchSchema.max(50)`, *not*
#265's 200). Each command is a heavier, individually-transacted unit; a door
device holds tens, not hundreds. Over-cap → `400` (per #265's over-cap rule).
Every command's implicit event must equal the path `{event_id}` or the whole
request is `400` (matches today's route guard).

### Response — `200`

A `200` is returned even when some commands are `CONFLICT` or `REJECTED`: those
are **business outcomes**, not transport failures. Results are positional and
also keyed by `operation_id`.

```json
{
  "results": [
    {
      "operation_id": "b8f0e5c2-3d4a-4c1e-9b7a-1f2e3d4c5b6a",
      "disposition": "APPLIED",
      "canonical": {
        "registration_id": 4821, "active": true,
        "checked_in_at": "2026-08-18T23:41:07.221Z",
        "reversed_at": null, "actor": "Dana Ruiz",
        "device_id": "ipad-door-2", "version": 1
      }
    },
    {
      "operation_id": "6a5b4c3d-2e1f-4a9b-8c7d-0e1f2a3b4c5d",
      "disposition": "APPLIED",
      "canonical": {
        "registration_id": 4821, "active": false,
        "checked_in_at": "2026-08-18T23:41:07.221Z",
        "reversed_at": "2026-08-18T23:41:53.004Z", "actor": "Dana Ruiz",
        "device_id": "ipad-door-2", "version": 2
      }
    }
  ],
  "applied_count": 2,
  "snapshot_fetched_at": "2026-08-18T23:41:53.010Z"
}
```

### Dispositions & result codes (unchanged from Gather)

| `disposition` | `code` | Meaning |
|---|---|---|
| `APPLIED` | — | State changed; `canonical.version` incremented; audit row written. |
| `ALREADY_APPLIED` | (prior code) | Replay of a seen `operation_id` with matching `command_hash`. Returns the stored canonical result. **No re-mutation.** |
| `CONFLICT` | `ALREADY_CHECKED_IN` | `CHECK_IN` on an already-active registration. |
| `CONFLICT` | `ALREADY_REVERSED` | `UNDO` when no active check-in exists. |
| `CONFLICT` | `STALE_VERSION` | `UNDO` where `expected_version` ≠ current `version`. |
| `REJECTED` | `UNDO_EXPIRED` | `UNDO` past `CHECK_IN_UNDO_WINDOW_MS`. |
| `REJECTED` | `NOT_FOUND` | Event/registration missing or not `ACTIVE`. |
| `REJECTED` | `FORBIDDEN` | Caller lacks `checkin:manage`. |
| `REJECTED` | `OPERATION_ID_REUSED` | `operation_id` seen before but for a *different* target or `command_hash`. |

`CONFLICT` results are **persisted** to `attendance_operations` (so a replay is
stable); `REJECTED/NOT_FOUND` and `REJECTED/FORBIDDEN` are terminal and, per
Gather, are surfaced without persisting an operation row.

---

## Idempotency & concurrency (the invariants to preserve)

These are the reasons the endpoint is safe to retry blindly — **do not
regress them** in the Lambda port.

1. **`operation_id` UNIQUE** on `attendance_operations`. First write wins; a
   replay short-circuits to `ALREADY_APPLIED` by reading the stored
   `canonical_result`. This is what makes "retry as a batch" (below) safe — a
   re-flushed queue never double-checks-in.
2. **`command_hash`** (SHA-256 of the canonical command). A replayed
   `operation_id` whose hash differs is `OPERATION_ID_REUSED`, not a silent
   overwrite — catches a client that reused a uuid for a different action.
3. **Per-command `SERIALIZABLE` transaction with retry.** Each command runs in
   its own serializable tx; a serialization failure (`P2034`) retries that
   command. The check-in mutation is guarded by
   `updateMany(where: { version }, data: { version: increment })` returning
   `count === 1`, so two devices racing the same registration cannot both win.
4. **Optimistic `expected_version` on `UNDO`.** Prevents undoing a check-in the
   device didn't know had already been superseded.

**Application order & partial durability.** Commands apply **in array order**,
each independently committed. If an *infrastructure* error (e.g. a `503` pool
timeout) interrupts mid-batch, the endpoint returns `200` with the results it
did commit (`applied_count < commands.length`) rather than failing the whole
request — mirroring `applyAttendanceCommands`, which breaks on an infra error
only after ≥1 success. The client re-flushes the un-acknowledged commands; step
1 makes that a no-op for anything already committed. Only a failure on the
**very first** command (zero committed) surfaces as a transport error (below).

---

## Transport-level errors (borrowed from #265)

These apply to the **request**, before or around per-op processing — distinct
from the per-op dispositions above.

| Status | Meaning | Client behavior |
|---|---|---|
| `400` | Malformed body, bad ISO date, over-cap (>50), or a command whose event ≠ `{event_id}`. Carries `details[]` of `{ path, message }`, indexed (`"commands[3].occurred_at"`). | Surface; fix the queue. Do **not** blind-retry. |
| `401` | Missing/expired Cognito token. | Re-auth, then retry (idempotent). |
| `403` | Caller has no `checkin:manage` for this event **at all**. | Surface. (A single out-of-scope *registration* is op-level `NOT_FOUND`, not this.) |
| `404` / `405` / `501` | Route not deployed. | **Fall back to single-command posts** (each a batch of 1) to the same path — idempotency is identical. |
| `429` / `503` / `504` | Throttle / pool pressure / timeout. Honor `Retry-After` (CORS-exposed). | **Retry the whole batch.** Safe by invariant 1. |

> Note the deliberate split: #265 puts "unknown id → `400`" because there a bad
> id means a bad request. Here a stale `registration_id` is an expected offline
> condition, so it is an **op-level `NOT_FOUND`** inside a `200`, and only
> structural problems (shape, cap, event mismatch) are transport `400`s.

---

## Rate-limit strategy (20 rps / 50 burst)

A multi-device door (say 6 iPads) flushing bursts must not trip the stage
throttle:

- **One in-flight sync per device.** Queue locally; never fan out concurrent
  syncs from one device.
- **Coalesce.** Flush on a short debounce or at the 50-command cap, whichever
  first — not per tap.
- **Honor `Retry-After` on `503`/`429`** with a small added jitter; retry the
  identical batch. Because every command is `operation_id`-idempotent, a batch
  that partially applied before a `503` re-applies cleanly (committed ones →
  `ALREADY_APPLIED`).
- **Backpressure, not loss.** A device offline or throttled keeps its queue
  durably and keeps rendering optimistic state via `applyPendingAttendance`;
  reconciliation happens on the next successful flush.

---

## `GET /events/{event_id}/attendance/snapshot`

Baseline for a joining device and the version vector for conflict detection.

```json
{
  "event_id": 512,
  "fetched_at": "2026-08-18T23:30:00.000Z",
  "registrants": [
    { "registration_id": 4821, "name": "Alex Kim", "email": "…", "phone": null,
      "group": "Table 3", "table": "3", "party": "Kim +1",
      "attendance_version": 0, "check_in": null }
  ]
}
```

Client merge is already implemented DB-agnostically:
`mergeAttendanceResults(snapshot, results)` folds a sync response back onto the
snapshot, and `applyPendingAttendance(snapshot, queued)` renders un-flushed
commands optimistically. Both port unchanged.

---

## Schema note

`attendance_operations` stays a **protocol table**, not a set of reference
tables (see the schema deep-dive): `operation_id` UNIQUE, `expected_version int?`,
`command_hash`, `canonical_result` (JSON text), and `kind` / `disposition` /
`result_code` as **module enums / CHECK constraints**. Turning these
wire-protocol codes into editable `/reference/*` rows would be a defect. The
`check_ins.version` optimistic-lock column carries over unchanged; only PK/FK
types move from `cuid()` to int.
