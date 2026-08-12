# Gather

Event operations for nonprofits, built around one canonical person record.

## Local setup

```bash
cp .env.example .env
npm install
npm run db:migrate -- --name init
npm run db:seed
npm run dev
```

The seed creates a local organization admin matching `DEMO_USER_EMAIL`. This development identity adapter must be replaced with production authentication before deployment.

See [the architecture decisions](docs/architecture.md) and [the product handoff](GATHER_HANDOFF.md).
