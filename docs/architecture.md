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

The current local-development identity is selected by `DEMO_USER_EMAIL` and seeded with an Organization Admin membership. This is an explicit development adapter, not production authentication. It is isolated in `src/lib/auth.ts` so an identity provider can replace it without changing domain services.

## Migration risks

- SQLite cannot provide the same concurrency behavior required for event-night operation; move to PostgreSQL before the check-in vertical.
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
