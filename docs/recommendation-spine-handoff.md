# Recommendation spine — interface handoff (for #21)

**Status:** proposal / request for the spine's shape. Written by the Claude agent on
branch `claude/issue-triage-plan-yqosxy` for the Codex agent building **#21**.

The agentic backlog (#21–31) is one system: a shared **recommendation spine**
plus per-issue **detector → executor** plug-ins. #21 builds the spine and the
first consumer (the readiness Copilot). This note says exactly what two
already-built detectors need from that spine, so the schema and service
signatures can be shaped to fit them (and the rest) on the first pass.

Division of labour in play: Codex owns **#21, #22, #25, #26, #27, #28, #29, #30,
#31**; Claude owns **#23, #24** (detectors already committed) and the
already-merged follow-ups on PR #37. See the scoping comment on issue #5.

## The common shape every issue repeats

> explain **why + evidence + proposed action + expected impact** → let staff
> **preview / approve / edit / dismiss / remind-later** → **deterministic
> validation** (capacity, permissions, lifecycle, money) → **audited &
> reversible** → **don't re-surface** a resolved item unless data changes.

So a recommendation is a stored, staff-reviewable proposal whose execution is a
validated, audited, reversible transaction — never a side effect of detection.

## What the detectors already produce

Both are pure, tested, and spine-independent. The spine consumes their output;
it does not need to change them.

- **#24 — `src/lib/host-followup.ts`** → `HostFollowup`:
  `{ groupId, groupName, hostName, urgency: "attention" | "urgent", reasons: string[],
  daysToEvent, remaining, needsPortalLink, draftMessage }`.
  `draftMessage` embeds the literal placeholder `{{host_portal_link}}`
  (exported as `HOST_PORTAL_LINK_PLACEHOLDER`) for the executor to substitute
  with a freshly recovered link (#9).
- **#23 — `src/lib/registration-pace.ts`** → `RegistrationForecast` +
  `buildOutreachRecommendation(forecast)` → `OutreachRecommendation | null`:
  `{ shortfall, daysRemaining, confidence, reason, requiresApproval: true }`.
  Returns null unless the Event is projected **behind** goal.

## What the spine must provide

### 1. A `Recommendation` record

Proposed fields (rename freely; the shape is what matters):

| field | notes |
|---|---|
| `id`, `organizationId`, `eventId` | scope |
| `kind` | enum; see per-kind list below |
| `status` | `PROPOSED` → `APPROVED`/`DISMISSED`/`SNOOZED`; `APPROVED` → `EXECUTED`; `SUPERSEDED` |
| `title` | one-line label |
| `why` | evidence prose (the detector's `reasons`/`reason`) |
| `evidence` | JSON — the structured signals used (per-kind shape) |
| `proposedAction` | JSON — structured, previewable, **re-validated at execution** (per-kind shape) |
| `confidence` | `low`/`medium`/`high` (or reuse urgency where a detector emits it) |
| `snoozedUntil` | for remind-later |
| `dedupeKey` | stable per (kind, subject) — see §4 |
| `createdById`, `decidedById`, `decidedAt` | audit |

Please make `evidence` and `proposedAction` **per-kind discriminated unions**
serialized to JSON, each with a zod schema validated at `approve` time — so the
executor can trust the payload rather than re-deriving it.

### 2. Lifecycle service

```
propose(input: { orgId, eventId, kind, title, why, evidence, proposedAction, confidence, dedupeKey })
  → upsert on (eventId, kind, dedupeKey): create when new, refresh an existing
    PROPOSED one, and DON'T resurface one already DISMISSED/SNOOZED unless the
    evidence hash changed (see §4). Returns the Recommendation.

approve(recommendationId, actor, { edits? })
  → re-validate proposedAction deterministically (capacity/permissions/lifecycle/
    money), run the registered executor for `kind`, set EXECUTED, write an AuditLog.
    Reversible where practical (executor returns an undo handle or the action is a
    draft that can be deleted).

dismiss(recommendationId, actor)   → DISMISSED + audit.
snooze(recommendationId, actor, until) → SNOOZED + snoozedUntil + audit.
```

### 3. Executor registry (append-only)

```
type Executor = (proposedAction, ctx: { tx, orgId, eventId, actorId }) => Promise<{ auditEntityId, reversible: boolean }>
registerExecutor(kind, executor)
```

Append-only registration keeps two agents out of each other's merges. Each
vertical adds one entry.

## Per-kind mapping for #23 and #24

**#24 host follow-up**
- `kind: "HOST_FOLLOWUP"`, one per Group.
- `dedupeKey: "host_followup:" + groupId`.
- `evidence`: `{ groupId, remaining, daysToEvent, urgency, needsPortalLink, reasons }`.
- `proposedAction`: `{ channel: "host_reminder", groupId, body: draftMessage }`
  where `body` still contains `{{host_portal_link}}`.
- **executor**: recover/refresh the Host portal link (reuse #9, idempotent),
  substitute the placeholder, create a **DRAFT** reminder via the #17
  communications path (do not send), audit. Reversible: delete the draft.

**#23 registration outreach**
- `kind: "REGISTRATION_OUTREACH"`, one per Event.
- `dedupeKey: "registration_pace:" + eventId`.
- `evidence`: the `RegistrationForecast` (projectedFinal, projectedRange,
  projectedGap, status, confidence, inputs, calculatedAt).
- `proposedAction`: `{ channel: "campaign", audienceHint: "prior_guests+unconverted_invitees", shortfall, body? }`.
- **executor**: create a **DRAFT** campaign via #17 targeting the suggested
  segment; approval required before send; audit. Reversible: delete the draft.

Both executors bottom out in the #17 draft-then-approve path, so "reversible"
is just "delete the unsent draft" — a good default for most kinds.

## §4 Dedupe / don't-resurface

`propose` should suppress a recommendation whose `(eventId, kind, dedupeKey)`
already resolved (DISMISSED or SNOOZED-and-not-yet-due) **unless the evidence
materially changed**. Simplest: store a hash of `evidence` on the record; on
re-propose, if the incoming hash equals the resolved record's hash, no-op;
if it differs, supersede and re-propose. This satisfies the recurring
"suppress repeatedly presenting the same resolved item" criterion in
#21/#24/#27/#31.

## Open questions for Codex

1. Is `evidence`/`proposedAction` as per-kind zod-validated JSON acceptable, or
   do you prefer separate typed tables per kind?
2. Snooze default duration and whether `snoozedUntil` auto-reproposes on expiry.
3. Where the executor's reversibility handle lives (audit row vs. a dedicated
   `reversal` record) — #21's readiness actions will set the precedent.

When the schema + `propose/approve/dismiss/snooze` signatures land, ping via the
#21 thread and I'll wire the #23/#24 loaders, `<RecommendationCard>` usage, and
the two executors against them.
