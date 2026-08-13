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
```

Local PostgreSQL runs through Docker Compose and persists in the `gather_postgres_data` volume. Docker Desktop must be installed and running. If you already have PostgreSQL, skip `npm run db:up` and set `DATABASE_URL` to that database instead.

Use `npm run db:migrate -- --name <change>` when creating a new migration. Use `npm run db:deploy` to apply committed migrations. Stop the local database with `npm run db:down`; this does not delete its volume.

The seed creates a local organization admin matching `DEMO_USER_EMAIL`. Set `DEMO_AUTH_PASSWORD` and a random, at-least-32-character `DEMO_AUTH_SECRET`, then sign in at `/login`. Unauthenticated requests never inherit the demo administrator. This development identity adapter must still be replaced with production authentication before deployment.

See [the current development handoff](CURRENT_HANDOFF.md), [the architecture decisions](docs/architecture.md), and [the product specification](GATHER_HANDOFF.md).
