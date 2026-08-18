# Gather architecture

## Repository discovery

The repository initially contained only the product handoff and README. There was no application architecture, deployment model, authentication, tenancy, canonical person model, permission system, API convention, component library, state manager, or router to preserve.

## Vertical 1 decisions

- Next.js App Router and TypeScript provide server-rendered UI and server actions in one deployable application.
- Prisma provides explicit relational constraints and portable migrations. SQLite is used only for local development; PostgreSQL is the intended production database before multi-device check-in work begins.
- `Person` is canonical within an organization. Registrations reference people rather than copying contact fields.
- Person matching is deterministic in Vertical 1: normalized email first, then normalized phone. Ambiguous matches are never automatically merged.
- Capabilities are derived from organization membership roles and checked inside every server mutation. Hiding a button is not considered authorization.
- Audit records are written in the same transaction as event and registration mutations.
- Server actions own validation and mutations. Pages query Prisma directly on the server; no public registrant-list API is introduced.

## Initial data model

- `Organization`: tenant boundary.
- `User`: authenticated actor identity.
- `Membership`: user-to-organization role.
- `Person`: canonical person, uniquely matched by normalized email or phone within an organization when provided.
- `Event`: organization-scoped event and lifecycle status.
- `Registration`: event-to-person relationship with one active record per pair.
- `AuditLog`: immutable mutation history with actor, entity, action, and JSON snapshots.

## Routes

- `/`: organization event list and empty state.
- `/events/new`: event creation.
- `/events/[eventId]`: event summary and registrant list.
- `/events/[eventId]/register`: staff registration and canonical person resolution.

## Authorization

Vertical 1 capabilities are `event:create`, `event:view`, and `registration:create`. Organization and Event Admins have all three; Event Staff can view and register; Viewer can only view. Server code resolves the current actor, confirms membership in the resource's organization, then checks the capability.

The local-development identity is selected by `DEMO_USER_EMAIL`, but requests must first establish an HTTP-only, HMAC-signed session through `/login` using `DEMO_AUTH_PASSWORD` and `DEMO_AUTH_SECRET`. There is no implicit administrator fallback. This remains a development authentication adapter; a production identity provider can replace it without changing domain services.

Organization roles and event roles are separate authorization scopes. `ORGANIZATION_ADMIN` and `VIEWER` can grant organization-wide capabilities, while `EVENT_ADMIN` and `EVENT_STAFF` are stored in `EventAssignment` for one event. Every event mutation supplies the event ID to authorization. The event list returns all events only for an organization-wide viewer; otherwise it is restricted to assigned event IDs.

## Migration risks

- PostgreSQL is the development and intended production database. Event-night operations still require concurrency and load testing against the production topology.
- Case-insensitive uniqueness is represented by normalized values rather than database collation.
- Nullable unique contacts allow people without email/phone but require staff-assisted duplicate handling later.
- Production authentication and session handling must replace the development actor before deployment.

## Vertical 1 implementation plan

1. Establish the tenant, actor, canonical person, event, registration, and audit schema.
2. Seed one local organization and admin actor.
3. Build event creation with validation and audit logging.
4. Build registration with deterministic person resolution, duplicate protection, and audit logging.
5. Display responsive event metrics and registrants with loading, empty, not-found, and friendly failure states.
6. Verify validation, normalization, capability boundaries, migration, lint, types, tests, and production build.

## Next vertical

Vertical 2 should add event-scoped Host roles, Groups, secure expiring host access, and host-added guests while continuing to reference canonical people.

## Vertical 2 design

Vertical 2 adds event-scoped hosting without turning Host into an organization-wide user role. A host remains a canonical `Person` and gains an `EventHost` relationship for one event. Each host relationship belongs to one `Group`; a group can exist without a host, while host creation may create a group in the same transaction. A person may host multiple events but can be designated only once per event.

`Group` is scoped redundantly by organization and event so tenant ownership is explicit in every query. Its optional capacity is configuration, not a stored counter. Occupied seats are derived from registrations assigned through nullable `Registration.groupId`; remaining seats are calculated as `capacity - registration count`. Existing Vertical 1 registrations remain valid and ungrouped. The existing `(eventId, personId)` registration uniqueness constraint remains the source of duplicate-registration protection.

### Host portal access

Host portal access uses opaque bearer tokens generated from cryptographically secure random bytes. Only a SHA-256 digest is stored in `HostAccessToken`; the raw token appears only in the generated portal URL. A token belongs to one `EventHost`, has an explicit expiry, can be revoked, and records last use. Multiple tokens may exist so access can be rotated without changing the host relationship. Portal errors do not disclose whether a token, host, event, or group exists.

The portal never accepts an organization, event, host, or group identifier as authority. Every read and mutation resolves those boundaries from the token digest and requires an unrevoked, unexpired token. Queries include the resolved organization, event, host, and group relationship, so a host cannot enumerate or mutate another group by changing a URL or form field. Tokens are bearer credentials and must be protected by HTTPS, redacted from application logs, excluded from analytics, and rate-limited before production exposure.

### Staff and portal authorization

Staff group and host administration requires the new `host:manage` capability after the event is resolved to its organization. Organization Admin and Event Admin receive it; Event Staff and Viewer do not. Staff mutations and portal guest registrations are validated on the server and audited in the same database transaction.

`AuditLog.actorId` becomes nullable and gains an optional `eventHostId`. Exactly one actor is supplied by application services: a user for staff operations or an event host for portal operations. This preserves truthful attribution without creating a fake authenticated user for a token-bearing host.

### Guest registration and capacity

Host-added guests use the existing normalized-email-then-phone canonical `Person` resolution rules. The resulting `Registration` has source `HOST` and the token-derived group. Registration creation, person reuse/creation, capacity validation, and audit logging occur in one transaction. If the email and phone resolve to different people, registration stops for staff resolution. If the person is already registered for the event, the unique constraint returns a friendly duplicate message and does not move the existing registration.

Capacity is a hard limit for host portal additions in this vertical. A group with no capacity is unlimited; a full group rejects new guests server-side. The portal displays capacity, occupied seats, remaining seats, a low-seat warning, an empty guest-list state, and friendly invalid/expired/revoked-token states. Staff over-capacity overrides are deferred to the seating vertical.

### Vertical 2 routes

- `/events/[eventId]/hosts/new`: staff workflow to create or associate a group, designate a host, and issue initial portal access.
- `/host/[token]`: isolated host portal with event details, capacity, and only that host's group guests.

Invitations, email delivery, tables, seating, parties, payments, and check-in remain outside this vertical.

## Vertical 3 design

Vertical 3 introduces tables and parties while preserving the distinction between organizational relationships and physical seating. A `Group` describes how guests were recruited or managed; a `Party` describes people who normally move together; a `SeatingTable` describes a physical event-night destination. None replaces another.

`SeatingTable` is explicitly organization- and event-scoped, has an event-local unique name, capacity, and optional notes. `Party` is also organization- and event-scoped and may exist independently of a group. Nullable `Registration.tableId` and `Registration.partyId` links make the registration the atomic seat-counting and seating-assignment unit. Occupancy is derived from assigned registrations rather than stored counters.

Assigning a group or party to a table updates all current member registrations in one transaction. A later individual move changes only that registration, intentionally allowing staff to split a party or group when needed without destroying the underlying membership. New registrations are not implicitly seated merely because their group or party was previously bulk assigned; automatic inheritance is deferred until seating rules are explicitly designed.

### Seating authorization and tenant isolation

The `seating:manage` capability is granted to Organization Admin, Event Admin, and Event Staff; Viewer remains read-only. Every seating mutation first resolves the event's organization and then re-resolves every submitted table, registration, group, or party identifier within that same organization and event. Browser-supplied identifiers never establish ownership.

Table creation, party creation, and seating moves are audited transactionally. Individual moves store the previous and new table IDs. Group and party moves store the affected registration IDs, source entity, destination, and whether capacity was overridden.

### Capacity behavior

Table capacity is a hard server-side constraint by default. A move calculates destination occupancy excluding registrations already seated at that destination, then adds only the registrations that would newly consume seats. Authorized staff may proceed over capacity only by explicitly selecting an override for that operation. Full and over-capacity tables remain visible with clear warnings; remaining seats are clamped at zero for display while the overage is shown separately.

Capacity-sensitive host registration, seating, and walk-in mutations run as serializable PostgreSQL transactions. Serialization failures retry the entire capacity decision, mutation, and audit write, preventing concurrent requests from both accepting the same final seat. Live concurrency verification is still required against PostgreSQL before event-night use.

### Vertical 3 route

- `/events/[eventId]/seating`: responsive table creation, party creation, table metrics, unassigned guests, and individual/group/party movement.

Drag-and-drop ballroom design, check-in, invitations, and automated party inference remain outside this vertical.

## PostgreSQL development architecture

PostgreSQL is now the only supported Prisma datasource for development and production. SQLite was useful for the first workflow prototypes, but its migration syntax and concurrency model are not carried forward into check-in work.

## Vertical 4: Check-In

Check-in is an event- and organization-scoped relationship with exactly one `CheckIn` row per registration. The unique `registrationId` constraint is the concurrency boundary: simultaneous stations cannot create duplicate attendance, and a uniqueness conflict is returned as the canonical already-checked-in state.

Undo marks the row with `reversedAt` and `reversedById` instead of deleting it. Staff can undo an active check-in for 15 minutes; every successful check-in and reversal writes an audit record in the same transaction. Re-checking a reversed registration reactivates its existing row.

The browser keeps an opaque station identifier in local storage for device attribution. Search runs locally over normalized name, email, phone, group, table, and party data, while connected workspaces refresh from the server every four seconds. Vertical 6 adds durable offline intent without changing the server-authoritative attendance model.

## Vertical 5: Walk-Ins

Walk-ins reuse the existing Person, Registration, SeatingTable, Group, and CheckIn models. The exception-desk mutation matches a canonical person by normalized email or phone, rejects ambiguous identity matches and existing event registrations, and creates a `WALK_IN` registration plus active check-in in one transaction.

Optional group and table assignments are event- and organization-scoped. Group capacity is always enforced; table capacity can be explicitly overridden by an authorized exception-desk actor and the override is captured in the audit state. `walkin:manage` is restricted to organization and event admins, keeping these controls out of the basic event-staff check-in workflow.

## Vertical 6: Offline Resilience

Attendance now uses one ordered command contract. Each client command carries a UUID operation ID, device ID, intent timestamp, operation kind, and observed attendance version. `AttendanceOperation.operationId` is globally unique; a stored command hash rejects reuse with altered fields. Applied attendance changes, their canonical response, the operation record, and the audit entry commit in the same serializable transaction.

`CheckIn.version` increments on check-in, reactivation, and reversal. Undo requires the exact active version and the server evaluates the fifteen-minute window at processing time. Duplicate delivery returns the stored canonical result without another mutation or audit. Distinct concurrent check-ins converge through PostgreSQL serialization and the unique registration check-in invariant.

The browser persistence seam has IndexedDB and in-memory adapters. It stores the minimum searchable event snapshot, ordered commands, retry metadata, and terminal conflicts under an authenticated-user/event namespace. React persists a command before optimistic display. Reconnect synchronization is single-flight and ordered; acknowledged results update the canonical snapshot and remove operations atomically. Walk-in creation remains online-only because identity matching and capacity decisions require current server state. No service worker or background sync is introduced.

## Vertical 7: Name Tags

Name tags are a derived, read-only event artifact, so Vertical 7 adds no schema or migration. One event-scoped module loads canonical Person identity through Registration, resolves host/walk-in/guest roles, applies the selected audience, and returns a stable alphabetical badge list to both preview and PDF callers.

Organization and Event Admins receive `nametag:manage`; Event Staff and viewers do not. The server re-resolves the event and authorization for both the preview page and PDF route. Audience identifiers for groups and tables are compared only against registrations already loaded through that event, preventing browser-supplied IDs from expanding tenant scope.

The initial printable adapter targets Avery 5395-compatible adhesive badges: 2⅓ by 3⅜ inches, eight per US Letter sheet. The browser previews the first sheet before generation. PDFs include name, table/group/role detail, and event name; direct label-printer integration and custom template editing remain later work.

Local development uses PostgreSQL 17 through `compose.yaml`. The database binds only to localhost, persists data in a named Docker volume, and includes a health check. `DATABASE_URL` uses the same connection contract whether the database is local, hosted, or deployed; secrets remain environment configuration and are not committed.

The three existing migrations were still uncommitted and had only been applied to the disposable local SQLite database, so their SQL was translated in place to PostgreSQL rather than adding a fake provider-switch migration. This preserves the Vertical 1, 2, and 3 migration history and allows a new PostgreSQL database to be built from zero with `prisma migrate deploy`. The old `prisma/dev.db` is intentionally not deleted, but Prisma no longer reads it.

Development flow:

1. Start PostgreSQL with `npm run db:up` or provide another PostgreSQL `DATABASE_URL`.
2. Apply committed migrations with `npm run db:deploy`.
3. Seed the development organization and actor with `npm run db:seed`.
4. Use `npm run db:migrate -- --name <change>` only when authoring a new schema migration.

Docker Desktop is an optional local runtime rather than an application dependency. CI and hosted environments should provision PostgreSQL separately and run `prisma migrate deploy` during release, never `prisma migrate dev`.

Database-backed App Router pages are explicitly dynamic. Production builds therefore validate and bundle the application without opening a database connection; PostgreSQL is required when those routes are served, not while the build artifact is created.

## Vertical 8: Invitations

Invitations are event-scoped funnel records with explicit Draft, Sent, Opened, Registered, Declined, Cancelled, and No Response states. One invitation module owns lifecycle eligibility and opaque 256-bit registration credentials. Only a SHA-256 token digest is stored; issuing or resending rotates the credential and gives the sender one opportunity to copy the raw link. Links expire after thirty days and cancelled, expired, draft, or terminal invitations cannot register.

Organization and Event Admins receive `invitation:manage`. Staff invitation identifiers are always resolved through the authorized organization and event. Hosts issue, resend, and cancel invitations only through an active host bearer token; event, group, and host scope are derived from that token rather than submitted identifiers. Invitee registration resolves all ownership from the invitation token, revalidates its lifecycle and group capacity in a serializable transaction, creates or reuses the canonical Person, creates an `INVITATION` Registration, advances the invitation to Registered, and writes its audit atomically.

Opening a valid link records the first Opened timestamp when available. Invitation records preserve sender, host/group, contact, sent/opened/responded timestamps, and linked registration for later conversion reporting. Email and SMS delivery remain external; Gather currently presents a secure link for the sender to share.

## Vertical 9: Dashboard & Reporting

Dashboard and reporting are derived read models over canonical event data, so this vertical adds no persistence model or migration. One event-reporting module owns the definitions for registered, active checked-in, attendance percentage, not arrived, walk-ins, unassigned guests, and over-capacity table issues. It also derives attendance cohorts, group/table health, and the invitation funnel. The event command center and reports workspace refresh their server-rendered snapshot every five seconds while keeping PostgreSQL authoritative.

The reporting seam exposes one authorized event workspace and one CSV serializer shared by every export. Event identifiers are first resolved to their organization and then checked with the existing event-scoped `event:view` capability. Exports never accept organization, registration, group, table, or invitation identifiers from the browser, use current canonical relationships, disable shared caching, include a UTF-8 byte-order mark for spreadsheet compatibility, quote CSV control characters, and neutralize formula-like cells.

Core CSV exports cover registrations, attendance, no-shows, walk-ins, hosts, groups, tables, invitations, and invitation conversion. Historical cross-event comparison remains later work because it requires a product definition for comparable cohorts; these event snapshots retain stable canonical person and registration references for that future reporting.

## Vertical 10: Registration Lifecycle

Registration cancellation is a soft, reversible lifecycle rather than deletion. `Registration.status` distinguishes Active from Cancelled and a database check constraint keeps `cancelledAt` consistent with that status. Cancelling an actively checked-in registration reverses its CheckIn and advances the attendance version in the same serializable transaction; both attendance and registration changes are audited. Restoration retains the prior group, table, and party assignments, but revalidates active group and table capacity before making the registration operational again.

Only active registrations contribute to event capacity, dashboard and report attendance, seating, check-in delivery, walk-in counts, and name-tag audiences. Cancellation history remains visible to staff and is available as a dedicated CSV export. Existing registration entry points reactivate a cancelled canonical registration rather than creating a duplicate, preserving the `(eventId, personId)` invariant and audit history.

Organization Admins, Event Admins, and assigned Event Staff receive `registration:manage`. Staff actions resolve registration ownership through the authorized event. A host bearer token derives its event and group scope server-side and can manage only non-host guest registrations in that group. Host edits to a canonical Person are rejected when that record participates in another registration, host role, or invitation. Event-scoped staff have the same protection; only an Organization Admin may deliberately update a shared organization-wide Person record.

## Event configuration and duplication

Event configuration remains part of the organization-scoped `Event` aggregate because its type, schedule, venue/address, registration window and visibility, contact details, and branding all share the event lifecycle and ownership boundary. Organization Admins and assigned Event Admins receive `event:manage`; Event Staff and viewers remain read-only. Configuration edits and lifecycle changes re-resolve the event's organization, authorize against that event, and write their audit in the same transaction.

Browser `datetime-local` values are interpreted explicitly in the event's IANA timezone before persistence, and stored instants are formatted back through that same timezone. This avoids silently shifting event times when the application server runs in a different timezone and rejects nonexistent daylight-saving wall times.

Lifecycle movement is deliberately forward-only and one stage at a time: Draft → Registration Open → Registration Closed → Event Live → Completed → Archived. Archived events are read-only. The transition service owns this rule so the UI cannot skip or reverse operational stages.

Duplication is an organization-level event-creation operation. It creates a new Draft with explicitly supplied dates and copies reusable event details, groups, and seating-table definitions. It never copies people, registrations, hosts or access tokens, invitations, parties, check-ins, attendance operations, event assignments, or audit history. This keeps the new event operationally empty while avoiding repetitive room and group setup.

## Production authentication

The development session adapter (a single shared `DEMO_USER_EMAIL`/`DEMO_AUTH_PASSWORD`) has been replaced with per-user credentials while preserving the original authorization seam. Each `User` now carries a scrypt `passwordHash` and a `sessionVersion`. `src/lib/password.ts` hashes and verifies passwords with Node's built-in scrypt and a self-describing stored format, adding no native dependency. `src/lib/session.ts` issues an HMAC-signed, HTTP-only cookie carrying the actor email and session version; the signature is verified before any payload bytes are parsed.

Sign-in resolves the user by normalized email and verifies the submitted password, running a fixed timing-guard hash when no account or password exists so a missing account and a wrong password are indistinguishable. `getActorAccess` and `getCurrentOrganization` reject a cookie whose version no longer matches the stored `sessionVersion`, so rotating a user's password or provisioning invalidates outstanding sessions. The capability model in `permissions.ts` is unchanged, so an external identity provider can later replace credential verification without touching authorization.

The seed provisions the first organization admin from `SEED_ADMIN_*`, and `scripts/manage-user.ts` (`npm run user:manage`) creates or updates users, sets passwords, and grants organization roles until an in-app user-management UI exists. `AUTH_SESSION_SECRET` (falling back to the legacy `DEMO_AUTH_SECRET`) signs sessions and must be at least 32 characters. Login rate limiting is deferred to the public-endpoint hardening pass.

## Deployment and hardening

The application ships as a self-contained Next.js standalone build (`output: "standalone"`). The multi-stage `Dockerfile` installs dependencies from the lockfile, generates the Prisma client, builds the standalone server, and copies only the standalone output, static assets, and the Prisma schema/CLI/engines into a minimal `node:22-alpine` runtime that runs as a non-root user. `docker-entrypoint.sh` applies committed migrations with `prisma migrate deploy` only when `RUN_MIGRATIONS=true`, so a single release step or init container migrates while app replicas start without racing each other; the container never runs `migrate dev`.

Continuous integration (`.github/workflows/ci.yml`) runs two jobs on pushes and pull requests to `main`: a database-free `checks` job (type-check, lint, test, production build) and a `postgres` job that provisions a PostgreSQL 17 service, deploys migrations, seeds, and runs the live `verify:postgres` HTTP contract.

Public and bearer-token entry points are rate limited in the Node server runtime rather than in `proxy.ts`, which Next 16 warns must not rely on shared in-process state. `src/lib/rate-limit.ts` is a dependency-free fixed-window limiter behind a `consumeRateLimit` seam that a distributed store can replace before running multiple instances; `src/lib/rate-limit-request.ts` derives the client IP from proxy headers. Limits are applied to sign-in, public registration, invitation registration, the host/invite/public-register page loaders (to throttle bearer-token guessing), and the attendance sync route (which returns HTTP 429 with `Retry-After`).

## Custom registration fields and person resolution

`EventRegistrationField` and ordered options are reusable definitions scoped to one event. `RegistrationFieldAnswer` stores typed event answers separately from canonical `Person` data. The registration-fields module owns audience visibility, definition invariants, answer parsing, and formatting. Checkbox means multi-select, yes/no is boolean, and hidden required fields are invalid.

The person-resolution module applies deterministic precedence: normalized email, normalized phone, exact normalized name plus structured address, then conservative fuzzy-name suggestions. Suggestions never choose or merge automatically. `person:resolve` is limited to Organization Admin and assigned Event Admin; public and bearer-token paths never receive candidate details.

Merges run in a serializable transaction, tombstone the source Person, retain `PersonMerge` snapshots, and write an audit record. If both people have a registration for one event, the target registration remains canonical and the source becomes `SUPERSEDED`; both answer histories remain intact. Operational reads exclude superseded rows.

Duplication copies field definitions/options with new IDs but never answers. Registration CSVs append stable custom-field columns. `/events/[eventId]/public-register` enforces public status, lifecycle, and registration windows and returns a generic organizer-contact response for uncertain identity outcomes.
