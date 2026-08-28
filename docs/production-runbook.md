# Gather production runbook

## Release gate

Run `npm run verify:release`, then apply migrations to a fresh PostgreSQL database and run `npm run verify:postgres`. Run `npm run test:e2e` against the release candidate. Never point active security or load tests at production.

Required production environment values are `DATABASE_URL`, `AUTH_SESSION_SECRET`, `APP_ORIGIN`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_NAME`, `SEED_ADMIN_PASSWORD`, and `SEED_ORGANIZATION_NAME`. `APP_ORIGIN` must exactly match the public HTTPS origin.

## Deployment verification

1. Confirm the deployed revision matches the intended Git commit.
2. Confirm `GET /healthz` returns HTTP 200 and `{ "status": "ok" }`.
3. Confirm `GET /readyz` returns HTTP 200 with `database: "ok"`.
4. Sign in with the administrator account and confirm the expected organization appears.
5. Use **Fill demo login**, sign in, and confirm the demo cannot see mutation controls.
6. Inspect structured logs for `Login dependency failure`, readiness failures, and unhandled errors.

## Database backup and restore drill

Use the hosting provider's point-in-time recovery when available. Also take a logical backup before risky migrations:

```bash
pg_dump --format=custom --no-owner --no-acl "$DATABASE_URL" --file=gather.dump
createdb gather_restore_test
pg_restore --exit-on-error --no-owner --no-acl --dbname="$RESTORE_DATABASE_URL" gather.dump
```

Run migrations and `npm run verify:postgres` against the restored database. Record the backup timestamp, restore duration, row-count checks, and operator. Delete the temporary restore database only after verification.

## Load and performance verification

Against an isolated staging database and server, set `GATHER_VERIFY_URL` and the matching `AUTH_SESSION_SECRET`, then run `npm run verify:load`. Capture total duration, error rate, readiness latency, database CPU/connections, and the slowest queries. Use `pg_stat_statements` and `EXPLAIN (ANALYZE, BUFFERS)` for slow queries; do not guess at indexes without a measured plan.

## Incident recovery

If sign-in returns HTTP 500, first check that the deployed commit is current, then inspect the structured `Login dependency failure` record and `/readyz`. Verify all migrations ran against the same schema used by the app. Roll back application code only when it is compatible with the already-applied schema; otherwise roll forward. Rotate `AUTH_SESSION_SECRET` only when invalidating every active session is intended.
