# Gather

Event operations for nonprofits, built around one canonical person record.

## Local setup

```bash
cp .env.example .env
npm install
npm run db:up
npm run db:deploy
npm run db:seed
npm run dev
# In another terminal:
npm run verify:postgres
```

Local PostgreSQL runs through Docker Compose and persists in the `gather_postgres_data` volume. Docker Desktop must be installed and running. If you already have PostgreSQL, skip `npm run db:up` and set `DATABASE_URL` to that database instead.

Use `npm run db:migrate -- --name <change>` when creating a new migration. Use `npm run db:deploy` to apply committed migrations. Stop the local database with `npm run db:down`; this does not delete its volume.

`npm run verify:postgres` creates temporary fixtures and exercises concurrent attendance delivery, idempotent replay, expected-version undo, audit uniqueness, and cross-event isolation through the live HTTP sync route. It removes its fixtures when finished.

## Authentication

Gather authenticates each user against a per-account password hash (scrypt) and issues an HMAC-signed, HTTP-only session cookie. Set a random, at-least-32-character `AUTH_SESSION_SECRET`, then sign in at `/login`. Unauthenticated requests are redirected to `/login`; there is no shared administrator account.

Set `APP_ORIGIN` to the canonical public origin before enabling a real invitation delivery provider. Outbound bearer links never trust the request `Host` header in production.

`npm run db:seed` provisions the first organization admin from `SEED_ADMIN_EMAIL`, `SEED_ADMIN_NAME`, and `SEED_ADMIN_PASSWORD`. Provision additional users with:

```bash
USER_PASSWORD="a-strong-password" npm run user:manage -- someone@org.example "Their Name" EVENT_ADMIN
```

Roles are `ORGANIZATION_ADMIN`, `EVENT_ADMIN`, `EVENT_STAFF`, `VIEWER`, and `MEMBER`; event-scoped roles are assigned per event. Changing a user's password bumps their session version, invalidating existing sessions. Passwordless accounts cannot sign in until a password is set. External identity providers (OAuth/SSO) can replace credential verification later without changing the capability model.

See [the current development handoff](CURRENT_HANDOFF.md), [the architecture decisions](docs/architecture.md), and [the product specification](GATHER_HANDOFF.md).
