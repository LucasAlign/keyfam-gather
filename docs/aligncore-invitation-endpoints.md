# Invitation Lifecycle Endpoints — Design Spec (Align Core events module)

> Specs Gather's invitation lifecycle as Align Core endpoints. Companion to
> [`aligncore-attendance-sync-endpoint.md`](./aligncore-attendance-sync-endpoint.md)
> and the [events-module SQL](./aligncore-events-module.sql). Source of truth:
> `src/lib/invitation-core.ts` (the shared lifecycle implementation that both the
> HTTP API in `src/lib/invitation-service.ts` and the in-app server actions in
> `src/app/invitation-actions.ts` delegate to) and `src/lib/invitations.ts` (the
> state-machine guards).

---

## The state machine (unchanged from Gather)

```
                 send                 open (GET)         register
   ┌────────┐  ─────────▶ ┌────────┐ ──────────▶ ┌────────┐ ─────────▶ ┌────────────┐
   │ DRAFT  │             │  SENT  │             │ OPENED │            │ REGISTERED │ (terminal)
   └───┬────┘  ◀───────── └───┬────┘             └───┬────┘            └────────────┘
       │        resend        │   \                  │
       │ cancel               │    \ decline ────────┼──────────────▶ ┌────────────┐
       ▼                      ▼     ▼                 ▼                │  DECLINED  │ (terminal)
   ┌───────────┐        (staff can cancel /       (invitee)           └────────────┘
   │ CANCELLED │◀────── mark no-response from                         ┌────────────┐
   └───────────┘        DRAFT/SENT/OPENED/NO_RESPONSE) ──────────────▶│ NO_RESPONSE│
                                                                       └─────┬──────┘
                                                                    resend ──┘ (re-enters SENT)
```

Two guard predicates drive every transition (ported verbatim from
`invitations.ts`):

- **`can_open`** — status ∉ {DRAFT, CANCELLED, NO_RESPONSE} **and** not expired.
  Governs the invitee GET and the `SENT → OPENED` bump.
- **`can_respond`** — `can_open` **and** status ∉ {REGISTERED, DECLINED,
  CANCELLED, NO_RESPONSE}. Governs register / decline.
- **`can_manage`** — status ∈ {DRAFT, SENT, OPENED, NO_RESPONSE}. Governs the
  staff/host send, resend, cancel, no-response actions.

---

## Token model (ported verbatim)

- 32 random bytes, base64url; **SHA-256 hashed at rest** (`event_invitations.token_hash`).
- **30-day TTL** (`expires_at`); regenerated on every `send`/`resend`, which
  also resets `opened_at`/`responded_at` to null.
- The **plaintext token is returned exactly once** — in the `send`/`resend`
  response — and never persisted. Treat it like Align treats
  `temporary_password`: sensitive, never logged or stored. Only `token_hash`
  is durable, so a lost token can only be replaced by a fresh `send`.
- Invitee-facing routes live under **`/public/invite/{token}`** (see the auth
  deep-dive) — an anonymous, token-scoped surface, since invitees have no
  Cognito login. Host-authored invites go through the host's own
  `/public/host/{host_token}` surface.

---

## Endpoints

### Staff (authenticated: `invitation:manage` via Cognito group ∪ `event_assignments`)

#### `GET /events/{event_id}/invitations`
List for the event roster. Query filters follow Align's integer/enum
validation: `status_id` (bad value → `400 { "error": "Invalid status_id" }`),
`group_id`. Returns the JOINed `status_name` beside `status_id`.

#### `POST /events/{event_id}/invitations`  — create a draft
`sender_id` is the authenticated caller (never client-set — mirrors
`event_invitations_single_sender` CHECK, host branch null).

```json
// request
{ "first_name": "Dana", "last_name": "Ruiz",
  "email": "dana@example.com", "phone": null, "group_id": 7 }
// 201
{ "invitation": { "invitation_id": 91, "status_id": 1, "status_name": "Draft",
                  "group_id": 7, "sender_id": 44, "expires_at": null } }
```
`group_id` (optional) must belong to `{event_id}` + caller org, else `400`
(request-body FK rule). Names pass #91 normalization.

#### `POST /events/{event_id}/invitations/{invitation_id}/send`  — send / resend
One endpoint covers first send and resend (Gather emits `invitation.sent` vs
`invitation.resent` by whether `sent_at` was already set). Mints a fresh token,
`status → SENT`, clears `opened_at`/`responded_at`.

```json
// 200 — the token is returned ONCE (sensitive)
{ "invitation": { "invitation_id": 91, "status_id": 2, "status_name": "Sent",
                  "sent_at": "2026-08-20T15:04:00Z", "expires_at": "2026-09-19T15:04:00Z" },
  "invite_url": "https://app.example.org/invite/8f3c…",   // contains the plaintext token
  "notification": { "channel": "email", "email_delivered": true } }
```

**Delivery (a deliberate choice — Gather does not email today).** Gather's
`sendInvitation` returns the raw token in a redirect for staff to share
manually. Two supported modes, both honoring Align's notification contract:

- **`manual`** (Gather-parity default): no email sent; staff copy `invite_url`.
- **`notify`**: best-effort branded email/SMS via the tenant's SES/Resend
  provider, gated by the `NOTIFICATIONS_DISABLED` kill switch. On failure the
  send **still succeeds** — the response carries `email_delivered: false` and
  `invite_url` so staff can share it manually, and an `INVITATION_EMAIL_FAILED`
  audit row is written (exactly the shape of `ONBOARDING_EMAIL_FAILED`).

Guard: `can_manage` — else `409` (below). Concurrency: a conditional update on
`status IN (DRAFT,SENT,OPENED,NO_RESPONSE)` that must affect exactly one row.

#### `POST /events/{event_id}/invitations/{invitation_id}/cancel`
`status → CANCELLED`, `responded_at = now`. Guard `can_manage`.

#### `POST /events/{event_id}/invitations/{invitation_id}/no-response`
`status → NO_RESPONSE`, `responded_at = now`. Guard `can_manage`.
(`NO_RESPONSE` is manageable, so a later `send` re-enters `SENT`.)

### Host (token-scoped: `/public/host/{host_token}`)

The host link is validated by `token_hash` lookup + not-revoked + not-expired,
scoped to the host's `(org, event, group)`; each use bumps
`host_access_tokens.last_used_at`.

- **`POST /public/host/{host_token}/invitations`** — create **and send** in one
  step (`status → SENT`, `sent_at = now`, `event_host_id` set, `group_id` forced
  to the host's group). Audit `invitation.host_sent`.
- **`POST /public/host/{host_token}/invitations/{invitation_id}/resend`** — guard
  `can_manage`; re-mints token. Audit `invitation.host_resent`.
- **`POST /public/host/{host_token}/invitations/{invitation_id}/cancel`** — guard
  `can_manage`. Audit `invitation.host_cancelled`.

Every host action re-resolves the invitation **within the host's group scope**
(`event_host_id` + `group_id` must match) — an out-of-scope id is `404`, never a
cross-group leak.

### Invitee (token-scoped: `/public/invite/{token}`)

#### `GET /public/invite/{token}`  — view (with the open side-effect)
Resolves by `token_hash`. Returns the event summary + whether the invitee may
still respond. **Side-effect:** if `status == SENT`, transition `SENT → OPENED`
(`opened_at = now`, audit `invitation.opened`). This is deliberate — viewing is
opening — and idempotent (only `SENT` moves; `OPENED`/`REGISTERED`/`DECLINED`
render their terminal state). Terminal/blocked states return a rendered status,
not an error, except a token that never existed → `404`.

#### `POST /public/invite/{token}/register`  — self-register from the invite
The most involved transition. In one `SERIALIZABLE` transaction (retry on
`40001`):
1. Load invitation by `token_hash`; require `can_respond` else `410 Gone`.
2. If the group has a `capacity`, count `ACTIVE` registrations in it; full →
   `409 { "error": "This group is full…" }`.
3. **Person resolution** (reuses `event_people` normalization): match on
   `email_normalized` / `phone_normalized` within the org. >1 match → `409`
   ("details match different records — ask staff"). 0 → create a person. 1 →
   reuse.
4. Conditionally claim the invitation: `status IN (SENT,OPENED) AND expires_at >
   now → REGISTERED`; must affect one row else `409` ("already answered").
5. Create or reactivate the registration (unique `(event_id, person_id)`;
   reactivate a `CANCELLED` one, `source = INVITATION`, adopt the invite's
   `group_id`). An already-`ACTIVE` registration → `409`.
6. Link `invitee_id` (+ `registration_id` when newly created), stamp the
   invitee's submitted contact fields onto the invitation. Audit
   `invitation.registered`.

```json
// request
{ "first_name": "Dana", "last_name": "Ruiz", "email": "dana@example.com", "phone": "+1…" }
// 200
{ "invitation": { "invitation_id": 91, "status_id": 4, "status_name": "Registered" },
  "registration": { "registration_id": 5502, "group_id": 7, "source_id": 4 } }
```

#### `POST /public/invite/{token}/decline`
Require `can_respond`; conditional `status IN (SENT,OPENED) AND not expired →
DECLINED`; one row else `409`. Audit `invitation.declined`. A token that is
already answered/expired → `410 Gone` (the page shows "unavailable").

---

## Error taxonomy

| Status | When |
|---|---|
| `400` | Validation (bad body, unknown/foreign `group_id`, bad `status_id` filter). `details[]` indexed. |
| `401` | Staff route without a valid Cognito token. |
| `403` | Authenticated caller lacks `invitation:manage` for the event. |
| `404` | Unknown `event_id`/`invitation_id`; host-scoped id outside the host's group; a token that never existed. |
| `409` | **State conflict** — the `can_manage`/`can_respond` guard failed, the group is full, ambiguous person match, or a concurrent response won the row (`updateMany` count ≠ 1). The single-record analog of Gather's "changed by another response." |
| `410` | **Gone** — a `/public/invite/{token}` action on an expired/cancelled/already-answered invite. Distinguished from `404` so the invitee page can say "expired or replaced" vs "never existed." |
| `429`/`503` | Throttle / pool pressure. Honor `Retry-After`; retriable — every write is a guarded conditional update, so a retry can only no-op (→ `409`), never double-apply. |

---

## Concurrency & idempotency

Every mutating transition is a **guarded conditional update** — `UPDATE …
WHERE invitation_id = ? AND status IN (<allowed>) [AND expires_at > now]` — that
must affect exactly one row, else the request is `409`. This is the same
optimistic guard Gather uses (`updateMany … count === 1`) and it makes the
endpoints safe under the race that matters: staff resending while the invitee is
registering. No two transitions can both win. `register`/`decline` additionally
run `SERIALIZABLE` with retry because they touch `event_people` + `registrations`
in the same transaction.

---

## Audit verbs (add to the Valid Action Names allowlist)

`invitation.created`, `invitation.sent`, `invitation.resent`,
`invitation.opened`, `invitation.registered`, `invitation.declined`,
`invitation.cancelled`, `invitation.no_response`, `invitation.host_sent`,
`invitation.host_resent`, `invitation.host_cancelled`, plus
`INVITATION_EMAIL_FAILED` for a failed `notify` delivery. Each carries
`previous_state`/`new_state` (status) in `details`; host actions carry
`event_host_id` (see the audit note in the events-module SQL).
