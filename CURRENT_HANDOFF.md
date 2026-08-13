# Gather development handoff

Date: August 13, 2026

## Start here

Gather is a Next.js 15 App Router application using TypeScript, React 19, Prisma 6, Zod, and PostgreSQL. Read:

1. `GATHER_HANDOFF.md` for the product specification and vertical order.
2. `docs/architecture.md` for design decisions through Vertical 5.
3. `README.md` for PostgreSQL setup.

Verticals 1–5 are committed on `main`. The current working tree contains the live migration correction and Vertical 6 implementation; preserve these changes until they are reviewed and committed.

## Implemented product state

### Vertical 1 — Event → Registrant

- Organization, User, Membership, canonical Person, Event, Registration, and AuditLog models.
- Organization-scoped server authorization and development identity via `DEMO_USER_EMAIL`.
- HTTP-only signed development sessions; unauthenticated requests no longer inherit the demo administrator.
- Event Admin and Event Staff access is stored as event-scoped assignments rather than organization-wide authority.
- Event creation and staff registration.
- Canonical Person matching by normalized email and phone.
- `(eventId, personId)` duplicate-registration constraint.
- Transactional audit records and responsive event/registrant states.

### Vertical 2 — Host → Group → Guest

- Event-scoped EventHost relationships backed by canonical Person records.
- Groups with optional capacity, including groups without hosts.
- Host creation with new or existing group association.
- Opaque 256-bit portal tokens stored only as SHA-256 digests.
- Expiration, revocation, last-used tracking, and generic invalid-token responses.
- Token-derived group scope; hosts cannot enumerate or select other groups.
- Canonical Person resolution for host-added guests, registration uniqueness, capacity enforcement, and actor-attributed audits.

Known follow-up: schema and access checks support token revocation, but no staff revoke/rotate interface exists.

### Vertical 3 — Tables & Seating

- Event-scoped SeatingTable and Party models; Group, Party, and SeatingTable remain distinct concepts.
- Nullable table and party assignments on Registration.
- Table and party creation plus person, group, and party seating moves.
- Server-side capacity calculation and explicit over-capacity override.
- Serializable, retry-safe transactions for capacity-sensitive host, seating, and walk-in mutations.
- Transactional audit details for previous assignments, affected registrations, destination, and override status.
- Responsive seating workspace with unassigned and over-capacity states.

New registrations deliberately do not inherit a group or party's existing table assignment.

### Vertical 4 — Check-In

- `checkin:manage` for organization admins, event admins, and event staff.
- One durable CheckIn per Registration, enforced by unique `registrationId`.
- Search by normalized name, email, phone, group, table, and party.
- Search-first, touch-friendly workspace with attendance metrics.
- Idempotent duplicate handling and friendly concurrent-station responses.
- Fifteen-minute undo using reversal fields rather than record deletion.
- Actor and persistent browser-station attribution with transactional audit logs.
- Four-second server refresh for near-real-time connected-station convergence.

### Vertical 5 — Walk-Ins

- Separate `walkin:manage` exception-desk capability for organization and event admins only.
- Expandable Add & Check In form inside the check-in workspace.
- Required name; optional email, phone, group, and table.
- Canonical Person reuse via normalized email or phone.
- Ambiguous-match and existing-registration protection.
- Event- and tenant-scoped group/table validation.
- Group capacity enforcement and explicit table-capacity override.
- Atomic Person/Registration/CheckIn/audit workflow using Registration source `WALK_IN`.
- Walk-in metrics on event and live check-in dashboards.

Vertical 5 required no new schema migration because it composes existing Person, Registration, Group, SeatingTable, CheckIn, and AuditLog models.

## Database and migrations

PostgreSQL is the only supported Prisma provider. SQLite is no longer read by the application.

There are six migration directories in the working tree:

1. `20260812160000_init`
2. `20260812201430_vertical_2_host_group_guest`
3. `20260812202532_vertical_3_tables_seating`
4. `20260812213000_vertical_4_check_in`
5. `20260813031000_event_scoped_roles`
6. `20260813143000_vertical_6_offline_attendance`

Repository database support includes:

- PostgreSQL migration SQL and PostgreSQL migration lock.
- `compose.yaml` for PostgreSQL 17 at `127.0.0.1:5432` with a persistent volume and health check.
- PostgreSQL URLs in `.env.example` and local `.env`.
- `db:up`, `db:down`, `db:logs`, `db:deploy`, `db:migrate`, and `db:seed` scripts.
- Dynamic database-backed App Router pages, allowing production builds without a database connection.

The historical `prisma/dev.db` was intentionally left untouched but is not used. No SQLite data migration was performed.

## Live PostgreSQL verification

Docker Desktop 4.86, WSL 2.7.11, and PostgreSQL 17 are installed and operational. All six migrations deploy cleanly from an empty Compose volume, seed succeeds, and Prisma reports the schema up to date.

Before starting Offline Resilience, use one of these paths.

### Local Docker

1. Install and start Docker Desktop.
2. Run `npm run db:up`.
3. Run `npm run db:deploy`.
4. Run `npm run db:seed`.
5. Run `npx prisma migrate status`.
6. Run `npm run dev`.

### Existing PostgreSQL

1. Point `DATABASE_URL` in `.env` at an empty development database.
2. Run `npm run db:deploy`.
3. Run `npm run db:seed`.
4. Run `npx prisma migrate status`.
5. Run `npm run dev`.

If migration deployment fails, correct the PostgreSQL migration SQL; do not revert Prisma to SQLite.

## Required smoke tests

- Create and view an event; add a normal registrant.
- Create a host/group, use the portal link, and add a guest.
- Create tables/parties and exercise person, group, and party moves, including capacity handling.
- Search and check in a registrant, then undo within the permitted window.
- Check in the same registration simultaneously from two stations and confirm one canonical active CheckIn.
- Add a walk-in with no contact details.
- Add or match a walk-in with group/table assignments; verify capacity rejection and authorized table override.
- Confirm event staff can check in but cannot see or invoke walk-in controls.
- Confirm organization/event admins can add walk-ins.
- Verify connected stations display new check-ins and walk-ins after refresh.
- Verify audit records and tenant/event scoping for all event-night mutations.

## Verification completed

- `npx prisma validate` — passed.
- `npx prisma generate` — passed.
- `npm test` — 41 tests passed across 9 files.
- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npm run build` — passed without a database connection.
- `git diff --check` — passed with line-ending warnings only.

Live browser smoke testing passed for event/registrant, host/group/guest, seating capacity rejection, check-in/undo, no-contact walk-in, queued attendance synchronization, and connected canonical refresh. `npm run verify:postgres` passed concurrency, idempotency, undo, audit, and event-isolation checks.

## Architectural constraints

- Person is canonical within an organization; registrations and attendance reference Person indirectly rather than copying identity data.
- Every tenant-owned mutation and query must enforce organization and event scope where applicable.
- Authorization is enforced server-side; hidden UI is not authorization.
- Important mutations are audited in the same transaction as the state change.
- Groups, Parties, and SeatingTables are independent domain concepts.
- Host portal URLs are bearer credentials; store only token digests and avoid logging raw URLs.
- Check-in concurrency relies on database constraints and idempotent behavior, not UI assumptions.
- `DEMO_USER_EMAIL` is a development adapter, not production authentication.
- Preserve the calm, responsive, touch-friendly event-day interface.
- Do not introduce invitations, email delivery, payments, fundraising, or unrelated infrastructure during offline work.

## Vertical 6 — Offline Resilience

```text
Lose Connection → Check In → Queue Changes → Reconnect → Synchronize
```

Implemented with a database-enforced operation ID, versioned attendance state, ordered batch sync route, IndexedDB queue/snapshot/conflict storage, durable enqueue before optimistic display, ordered retry and partial acknowledgement, explicit connectivity/unsynced state, canonical conflict display, cached search data, and online-only walk-in messaging.

The in-app browser safety layer prevented clicking after localhost was intentionally stopped, so the exact UI disconnect/reconnect gesture is covered at the queue seam instead of as an automated browser test. Connected synchronization and canonical refresh were verified in the browser; retry retention, partial acknowledgement, and conflict persistence are covered by tests.

Vertical 6 should build on the existing server-authoritative check-in contract and include:

- A client-generated idempotency key for each attendance operation, enforced by the database.
- The minimum cached event dataset required for offline registrant search.
- A durable device-local queue for check-in and permitted undo operations.
- Explicit online/offline state and visible unsynced-action count.
- Ordered reconnect synchronization with retry-safe requests.
- Canonical server responses for duplicate operations and conflicts.
- Clear conflict behavior when another device checks in or reverses the same registration.
- Queue retention across reloads and browser restarts.
- Tests for duplicate delivery, reordering, partial sync failure, retry, conflict convergence, tenant isolation, and queue recovery.

The server remains the source of truth. Do not add QR check-in, invitations, or name tags as part of this vertical.
