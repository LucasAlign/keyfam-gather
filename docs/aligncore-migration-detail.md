# Gather → Align Core — Auth & Schema Deep-Dive

> Companion to [`aligncore-migration-audit.md`](./aligncore-migration-audit.md).
> Drills into the two foundational phases: **Phase 1 (auth & role mapping)**
> and **Phase 2 (table-by-table schema translation)**. Assumes Option B —
> Gather becomes a module inside Align Core's backend.

---

## Part A — Authentication & Role Mapping (Phase 1)

### The two authorization models

**Gather** has two role axes plus an anonymous token lane:

- **Org role** (`MembershipRole`, per `Membership`): `ORGANIZATION_ADMIN`,
  `EVENT_ADMIN`, `EVENT_STAFF`, `VIEWER`, `MEMBER`.
- **Event role** (`EventRole`, per `EventAssignment`): `EVENT_ADMIN`,
  `EVENT_STAFF` — scoped to a single event.
- **Capabilities** are the real unit of authorization (`permissions.ts`, 12 of
  them). `actorHasCapability = orgRoleCaps ∪ eventRoleCaps`.

The important detail: at the **org** level, only `ORGANIZATION_ADMIN` holds
capabilities; `EVENT_ADMIN`/`EVENT_STAFF`/`MEMBER` hold **none** org-wide and
earn their capabilities **per event** via `EventAssignment`. `VIEWER` gets
`event:view` org-wide. So Gather already separates a *coarse* org role from a
*fine, per-event* grant.

- **Anonymous lane:** hosts and invitees have **no user account**. Access is a
  32-byte random token, SHA-256-hashed at rest (`host_access_tokens.tokenHash`,
  `invitations.tokenHash`), 30-day TTL, revocable, scoped to
  `(organizationId, eventId, groupId)`.

**Align Core** has a single Cognito-driven model:

- **Cognito groups** (coarse role): `Admins`, `Coordinators` (= Admin backend
  access), `Advocates`, `Volunteers`, `Families`. Mirrored 1:1 to
  `user_types`; `users.role_id` is canonical for Advocate.
- **Fine scope is data, not a claim:** Volunteers are gated by having ≥1
  `volunteer_families` row; Families are pinned to a server-set
  `custom:familyId` JWT claim; Advocates are scoped by `volunteers.church_id`.
- **No anonymous authenticated path.** Only `GET /health` and `GET /public/*`
  are unauthenticated.

### The key insight

**Align's idiom is exactly Gather's idiom:** a coarse Cognito group + a join
table for fine scope. Gather's "org role is coarse, `EventAssignment` grants
per-event" maps directly onto Align's "Cognito group is coarse,
`volunteer_families` grants per-family." `event_assignments` **is** the
`volunteer_families` of the events module.

### Role mapping

| Gather role | → Align Core | Notes |
|---|---|---|
| `ORGANIZATION_ADMIN` | `Admins` group (or `Coordinators`) | Full capability set. Clean 1:1. |
| `VIEWER` | *no direct group* | Align has no read-only group. Add a `Viewers` Cognito group, or gate read-only via a capability check in-handler. |
| `EVENT_ADMIN` (event-scoped) | authenticated group + `event_assignments` row (`role = EVENT_ADMIN`) | Cognito groups are pool-global; they **cannot** express "admin of event X only." Model per-event roles as data, gated in-handler — same as `volunteer_families`. |
| `EVENT_STAFF` (event-scoped) | authenticated group + `event_assignments` row (`role = EVENT_STAFF`) | Same mechanism. |
| `MEMBER` | base authenticated user | No capabilities until assigned. |

Enforcement moves **out of the Next.js app and into the Lambda handlers**:
port `permissions.ts` into handler middleware that derives the org role from
`cognito:groups` and the event role from an `event_assignments` lookup, then
runs the identical `actorHasCapability` union. The 12-capability matrix carries
over unchanged.

### The hard part — anonymous host & invite tokens

Cognito has no anonymous grant, and minting a throwaway Cognito user per host
(30-day, ephemeral) is the wrong shape. **Keep Gather's signed-token model** and
expose it through new public routes:

- `GET/POST /public/host/{token}` and `GET/POST /public/invite/{token}`, added
  to the `/public/*` allow-list and the CORS origins for the customer app.
- Validation is a `tokenHash` lookup in `host_access_tokens` /
  `event_invitations` (SHA-256 of the presented token), plus the existing
  `isHostTokenActive` (not revoked, not expired) and `assertHostScope`
  `(org, event, group)` checks — logic ports verbatim.
- This is **net-new public surface** for Align (which today exposes only health
  + reference data publicly). Rate-limit it explicitly; the 20 rps / 50 burst
  stage throttle does not cover a path unless it routes through the API stage.

### Audit mapping

| Gather `AuditLog` | → Align `audit_log` |
|---|---|
| `action` | `action_name` (add Gather verbs to the *Valid Action Names* allowlist) |
| `actorId` | `user_id` (nullable) |
| `entityType` + `entityId` + `previousState` + `newState` | fold into `details` JSON (`{ resource, resourceId, changes }`) |
| `eventId` scope | Align `audit_log` has no event column → carry in `details`, or extend the table |
| `eventHostId` (anonymous host actor) | Align `audit_log` has no non-user actor → carry in `details`, or extend the table |

Two Gather audit fields have no home in Align's `audit_log` (event scope,
host-actor). Either extend the table with `event_id` / `event_host_id`, or
encode them in `details` — decide before Phase 3 so the audit writer is stable.

---

## Part B — Schema Translation (Phase 2)

### Conventions to adopt (so the module is idiomatic)

| Gather convention | Align Core convention |
|---|---|
| PK `id String @default(cuid())` | `<entity>_id int PK` (e.g. `event_id`, `registration_id`) |
| FK `xId String` | bare int `<target>_id`; list endpoints JOIN and return `<x>_name` label beside the id |
| `createdAt` / `updatedAt` | `created_on` / `updated_on` |
| Postgres `enum` | lookup table **or** module-local enum (see decision below) |
| hard delete + `onDelete: SetNull` | consider soft-delete via `deactivated_on` (Align's #159 pattern) |
| app-side FK checks | request-body FK validation → `400` standard error; out-of-scope → `403` |
| — | free-text normalization (#91) runs automatically; **markup is preserved verbatim** |

> **Consequence of #91 for Gather:** the API stores free text un-escaped. The
> name-tag **PDF** and report **CSV** generators are non-escaping exports, so
> they **must** escape on render — this is a real correctness item, not a nicety.

### Enums: lookup table vs module enum — don't reflex to reference tables

Align's convention is "lookup table per set," but that's for **tenant-meaningful,
renameable labels**. Several Gather enums are **developer/protocol invariants**
and should stay as Postgres enums / CHECK constraints, *not* editable reference
rows:

| Gather enum | Treatment | Why |
|---|---|---|
| `EventStatus` | **Lookup table** w/ semantic flag (#99 pattern) | Tenant-visible; behavior (can-register, can-check-in) should key off a `phase` flag column, not the label. |
| `RegistrationSource` | **Lookup table** | Displayable, reportable. |
| `InvitationStatus` | **Lookup table** | Displayable lifecycle. |
| `MembershipRole` / `EventRole` | **Module enum** | Authorization contract; mirror to Cognito groups, not tenant-editable. |
| `RegistrationFieldType` / `RegistrationFieldVisibility` | **Module enum** | Code branches on these; not labels. |
| `AttendanceOperationKind` / `AttendanceDisposition` / `AttendanceResultCode` | **Module enum / CHECK** | Wire-protocol codes for the sync contract; exposing them as editable rows would be a bug. |

Adopt the **semantic-flag** discipline (#99) for the lookup-table ones: gate
behavior on an admin-set flag column (e.g. `event_status.phase`), leave the
display name freely renameable.

### The `Person` decision (the crux)

Gather's `Person` is a canonical, org-scoped, deduplicated **contact** —
normalized email/phone/address, merge tombstones. Align Core has **no general
person**: `users` are app logins; `parents`/`children` are foster-family members.
An event attendee is none of these.

**Recommendation:** create a new module table (`event_people` / `attendees`), do
**not** overload Align `families`/`parents`. Port `normalization.ts`,
`person-resolution.ts`, and the `PersonMerge` subsystem verbatim (the logic is
DB-agnostic). Optionally add a nullable `user_id` FK so an attendee who also has
an Align login can be cross-linked — but never require it.

### Worked table translations

Representative mechanical translations — the rest of the 15+ tables follow the
identical rules.

**`Event` → `events`**

| Gather | Align module |
|---|---|
| `id String cuid` | `event_id int PK` |
| `organizationId String` | `organization_id int` (or dropped if single-tenant) |
| `name`, `description`, `venue`, `address` | same, `varchar`/`text` |
| `status EventStatus` | `status_id int → event_status` |
| `startsAt`/`endsAt`/`registrationOpensAt`/`registrationClosesAt DateTime` | `starts_on`/`ends_on`/... `timestamp` |
| `brandingPrimaryColor`, `brandingLogoUrl` | `branding_primary_color`; logo → `branding_logo_s3_key` (S3 pattern) |
| `createdAt`/`updatedAt` | `created_on`/`updated_on` |

**`Registration` → `registrations`**

| Gather | Align module |
|---|---|
| `id`, `eventId`, `personId`, `groupId?`, `tableId?`, `partyId?` | `registration_id PK` + int FKs `event_id`, `person_id`, nullable `group_id`/`table_id`/`party_id` |
| `source RegistrationSource` | `source_id int → registration_source` |
| `status RegistrationStatus` | `status_id int → registration_status` |
| `supersededByRegistrationId?` | `superseded_by_registration_id int?` (self-FK preserved) |
| `@@unique([eventId, personId])` | unique `(event_id, person_id)` |

**`CheckIn` → `check_ins`** — `version int` (optimistic lock) carries over
unchanged; only PK/FK types change.

**`AttendanceOperation` → `attendance_operations`** — the idempotency contract is
preserved exactly: `operation_id` UNIQUE, `expected_version int?`, `command_hash`,
`canonical_result`, `disposition`/`result_code` as module enums. This is a
protocol table — **do not** turn its enums into reference rows.

**`HostAccessToken` → `host_access_tokens`** — `token_hash` UNIQUE stays a
SHA-256 hex string (it is not an ID and does **not** get remapped);
`expires_at`, `revoked_at`, `last_used_at` carry over.

### Data migration: the ID remap

`cuid()` strings → serial integers requires an ETL with a per-entity mapping
table (`old_cuid → new_int`), applied in FK-dependency order:

```
Organization → User → Person → Event → EventAssignment
  → Group → SeatingTable → Party → Registration
  → EventHost → HostAccessToken → Invitation
  → CheckIn → AttendanceOperation → RegistrationField(+Option+Answer)
  → PersonMerge → AuditLog
```

Token hashes (`token_hash`) and normalized keys copy across **unchanged** — only
surrogate PKs/FKs are remapped. Run the `verify:postgres` scenarios
(concurrency, idempotent replay, expected-version undo, cross-event isolation)
as an **API-level** acceptance suite against the migrated module before cutover.
