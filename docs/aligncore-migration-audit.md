# Gather → Align Core — Backend Migration Audit

> Retrofit audit of every database reference and data call in the Gather app
> (`keyfam-gather`), mapped against the **Align Core** AWS backend
> (`LucasAlign/BackEnd-FrontEnd-Refrences`). Scope: what exists, what's partial,
> and what must be built to run Gather as a new app in Align Core AWS.

## The core finding

**Gather and Align Core are different products.**

- **Gather** is event operations — events, registrations, seating, check-in,
  hosts, invitations.
- **Align Core** is a foster/adoptive **family-support / WrapAround
  case-management** backend — `families`, `parents`, `children`, `volunteers`,
  `advocates`, `needs`, `need_claims`, `threads`, `training_modules`,
  `agreement_templates`.

There is almost no domain overlap.

**Gather does not currently call any external backend.** It talks to its own
PostgreSQL through Prisma, directly, from Next.js Server Actions and three Route
Handlers. There is exactly one `fetch` in the codebase and it points at Gather's
own `/events/{id}/check-in/sync` route. So "retrofit to point to the AWS
backend" is not swapping one API for another — it is **introducing a backend
where there is none** for this domain.

Only two Gather concepts have real Align Core equivalents:

- `User` → `users` (Cognito-backed)
- `AuditLog` → `audit_log`

Everything else in Gather's 20-model schema is partial or entirely absent.

**Data-access footprint:** 49 direct `db.*` call sites · 32 exported Server
Actions · 3 Route Handlers (`check-in/sync`, `reports/export`,
`name-tags/pdf`).

---

## Gap matrix — every Gather model

Status reflects the **target** (Align Core), not the Gather side.

| Gather model | Status | Align Core equivalent | Gap |
|---|---|---|---|
| `User` | ✅ EXISTS | `users` | Cognito-backed, but integer PK vs `cuid()`; role model differs. |
| `AuditLog` | ✅ EXISTS | `audit_log` | Compatible; add Gather's verbs to the *Valid Action Names* allowlist. |
| `Person` | 🟠 PARTIAL | `families` / `parents` / `children` / `users` | Align splits people across four tables; no single canonical person record. Gather's address-normalized `Person` + dedup has no home. |
| `Membership` | 🟠 PARTIAL | Cognito groups + `users.role_id` | Roles are Cognito groups; no per-organization membership table. |
| `Invitation` | 🟠 PARTIAL | `POST /onboarding/invite` | Align invites *family-portal logins*. Gather's token-hash invite with DRAFT→SENT→OPENED→REGISTERED lifecycle does not exist. |
| `Organization` | 🔴 MISSING | — (tenant+env at infra) | Align is single-tenant-per-deployment; no multi-org-in-one-DB model. |
| `EventAssignment` | 🔴 MISSING | — | No event concept → no event-scoped role assignment. |
| `PersonMerge` | 🔴 MISSING | — | No person-dedup / merge subsystem (snapshots, tombstones). |
| `Event` | 🔴 MISSING | — | The central table of the whole app. Nothing like it. |
| `Registration` | 🔴 MISSING | — | Attendee registrations with source/status lifecycle + supersession. |
| `EventRegistrationField` | 🔴 MISSING | — | Dynamic custom-field system. Align intake (`family_profiles`) is fixed, not per-event configurable. |
| `EventRegistrationFieldOption` | 🔴 MISSING | — | Dropdown/radio option sets. |
| `RegistrationFieldAnswer` | 🔴 MISSING | — | JSON answers keyed to registration + field. |
| `Group` | 🔴 MISSING | — | Event guest groups (host tables). |
| `EventHost` | 🔴 MISSING | — | Host-a-table with delegated guest management. |
| `HostAccessToken` | 🔴 MISSING | — | Token-scoped, expiring host portal access. Align auth is Cognito-only; no anonymous grant. |
| `SeatingTable` | 🔴 MISSING | — | Physical seating layout with capacity. |
| `Party` | 🔴 MISSING | — | Grouped seating parties. |
| `CheckIn` | 🔴 MISSING | — | Attendance record with reversal + optimistic version. |
| `AttendanceOperation` | 🔴 MISSING | — | Offline-first idempotent command ledger. The hardest thing to port. |

---

## What's missing — the inventory

### Database tables to create (15+ net-new)

**Event core:** `events`, `event_assignments`, `registrations`, `groups`
**Custom fields:** `event_registration_fields`, `event_registration_field_options`, `registration_field_answers`
**Hosts & access:** `event_hosts`, `host_access_tokens`, `event_invitations`
**Seating:** `seating_tables`, `parties`
**Attendance:** `check_ins`, `attendance_operations`
**Identity / dedup:** `person_merges` (+ `organizations`, `memberships` only if multi-tenancy is kept)

### Reference / lookup rows to seed (11 sets)

Gather ships these as Postgres `enum`s. Align Core's convention is a **lookup
table per set** (see `user_types`, `community_status`) exposed through the
reference-table CRUD API. Each becomes a seeded lookup table or a module-local
enum. Value counts in parentheses:

- `event_status` (6), `event_role` (2), `membership_role` (5)
- `registration_source` (5), `registration_status` (3), `registration_field_type` (10), `registration_field_visibility` (3)
- `invitation_status` (7)
- `attendance_operation_kind` (2), `attendance_disposition` (4), `attendance_result_code` (7)

### API endpoints to build (whole surface)

Align Core exposes **none** of these. Paths below are illustrative targets in
Align Core's route style.

| Domain | Endpoints Gather needs |
|---|---|
| Events | `GET/POST /events` · `GET/PUT /events/{id}` · `POST /events/{id}/duplicate` · `POST /events/{id}/status` |
| Registrations | `POST /events/{id}/registrations` (5 sources) · `PUT /registrations/{id}` (update/cancel/reactivate) · `POST /events/{id}/walk-in` |
| Registration fields | `POST /events/{id}/registration-fields` (+ options) · `PUT /registration-fields/{id}` |
| Hosts & groups | `POST /events/{id}/hosts` · `POST /groups` · `POST /hosts/{id}/access` (rotate/revoke) · `GET/POST /host/{token}/...` |
| Invitations | `POST /events/{id}/invitations` · `POST /invitations/{id}/send\|resend\|cancel` · `GET/POST /invite/{token}` |
| Seating | `POST /events/{id}/tables` · `POST /parties` · `POST /seating/move` |
| Attendance | `POST /events/{id}/check-in/sync` (idempotent batch) · `GET /events/{id}/attendance/snapshot` |
| People / merge | `POST /people/merge` |
| Reports & docs | `GET /events/{id}/reports/export` (CSV) · `GET /events/{id}/name-tags/pdf` |

---

## Cross-cutting mismatches

Not missing tables — structural differences that touch every table and call.

| Concern | Gather today | Align Core | Impact |
|---|---|---|---|
| Primary keys | `cuid()` strings | integer PKs | Every FK, index, and client type changes. IDs not portable as-is. |
| Auth | demo-session cookie (dev-only) | Cognito IdToken (Bearer) | Gather's auth is explicitly "replace before deployment." Cognito groups become the role source. |
| Roles | 5 org roles + 2 event roles | 5 Cognito groups | ORG_ADMIN/EVENT_ADMIN/EVENT_STAFF/VIEWER/MEMBER don't map to Admins/Coordinators/Advocates/Volunteers/Families. Event-staff + host-token access need a new mechanism. |
| Tenancy | multi-org, one DB | single tenant+env per deploy | Collapse to one org per deployment, or add org scoping the Align way. |
| Data access | Prisma-direct, 49 sites | REST over Cognito | Every `db.*` becomes an authed HTTP call (or moves into a Lambda). Rate limit 20 rps / 50 burst. |
| Offline sync | idempotent command ledger | no equivalent | Door bursts must respect throttling + `503` retry, ideally via Batch Writes (#265). |
| Public surfaces | public-register, host/invite tokens | only `/health` + `/public/*` | Unauthenticated registration + token portals need new public routes / a token pattern Align lacks. |
| Documents | CSV + PDF route handlers | S3 pre-signed (photos only) | Name-tag PDF + report CSV have no Align counterpart; reuse S3/pre-signed for delivery. |

---

## What you *can* reuse

- **Cognito auth & groups** — replaces the dev-only demo session outright.
- **`users` + `/people/users/me`** — identity for event actors & assignees; avatars via `POST /people/users/{id}/avatar-upload-url`.
- **`audit_log`** — direct home for Gather's `AuditLog`.
- **Reference-table CRUD** (`/reference/*`) — the pattern to model all 11 enum sets.
- **Batch Writes (#265)** — bounded bulk contract for check-in sync + bulk registration import.
- **S3 pre-signed uploads** — event branding logos, name-tag / report output delivery.
- **Email infra (SES / Resend)** — invitation sends & confirmations, with kill-switch + audit fallback.
- **API conventions** — response envelope, CORS allow-list, `503` retry, `?db_timing`, query-param & FK validation.

---

## Wayfinder — the migration path

Dependency-ordered. Phase 0 is a decision that changes everything after it.

### Phase 0 — Pick the seam (decide first)

- **(A) Thin client:** Gather stays a Next.js app; its data layer calls Align
  Core's REST API over Cognito. Fastest, but the event domain still has to exist
  *somewhere* in Align Core, and server-rendered PDF/CSV + public token portals
  fight the REST-only model.
- **(B) New module in Align Core — _recommended_ (matches "new app in align core
  aws"):** Gather's domain becomes a first-class module in Align Core's backend
  (own Lambda handlers + Postgres tables, integer PKs, Align conventions). The
  Next.js app becomes a pure client. More upfront work; the only option that
  makes Gather *native* to the modular backend.

Phases below assume **Option B**.

1. **Auth cutover.** Retire the demo-session cookie. Adopt Cognito: map Gather's
   roles onto the five groups, and decide the fate of event-scoped staff roles
   and anonymous host/invite token access (likely signed, short-lived tokens
   minted by the module).
2. **Provision the Events schema.** ~15 tables with integer PKs via Align's
   migration tooling (not Prisma). Seed the 11 reference sets. Settle tenancy
   (one org per deploy, or carry `organizations`/`memberships` forward).
3. **Build the Events API surface.** Implement the §"API endpoints" groups as
   Align Lambda routes following its response envelope, FK-validation, free-text
   (#91), and audit conventions. Honor 20 rps / 50 burst + `503` retry.
4. **Reconcile people.** Decide whether attendees reuse `families`/`parents` or a
   new event-scoped person table. Port normalization + `PersonMerge` (snapshots +
   tombstones) — net-new either way.
5. **Port the hard parts.** The attendance sync ledger — idempotent by
   `operationId`, optimistic `expectedVersion`, full disposition/result-code
   vocabulary — rebuilt on Batch Writes (#265). Then invitation lifecycle emails
   (SES/Resend) and PDF/CSV generation (delivered via S3 pre-signed URLs).
6. **Stand up public surfaces.** Public registration + host/invite token portals
   as new public routes guarded by the Phase 1 signed tokens; add the customer
   app origin to the CORS allow-list.
7. **Rewire the Next.js app & migrate data.** Swap all 49 `db.*` call sites and
   the 3 route handlers for the Align API client. Migrate rows with the
   string→integer ID remap. Re-express the `verify:postgres` harness as an
   API-level acceptance suite (concurrency, idempotent replay, expected-version
   undo, cross-event isolation). Dual-run before cutover.

---

### Sources

- **keyfam-gather** — `prisma/schema.prisma`, `src/lib/*`, `src/app/*-actions.ts`, 3 route handlers.
- **Align Core** — `AlignCore-api-reference.md`, `AlignCore-db-reference-replit.md` (`LucasAlign/BackEnd-FrontEnd-Refrences`).
