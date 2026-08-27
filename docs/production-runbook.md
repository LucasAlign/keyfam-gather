# Production runbook

## Chosen topology

Run Gather as the repository's standalone Node.js container behind a TLS-terminating reverse proxy or managed container platform. Use managed PostgreSQL with encrypted connections, automated daily backups, point-in-time recovery, and a tested retention policy. Run at least two application instances for event-night availability; the database-backed public rate limiter and attendance contracts work across instances.

The public domain and vendors remain deployment inputs because this repository contains no cloud account or DNS authority. Set the public domain at the proxy/platform, direct its health check to `/health`, and do not expose the container's port directly to the internet.

## Required secrets

- `DATABASE_URL`: pooled production PostgreSQL connection using TLS.
- `DEMO_USER_EMAIL`: temporary production operator email until the identity adapter is replaced.
- `DEMO_AUTH_PASSWORD`: unique high-entropy password stored in the platform secret manager.
- `DEMO_AUTH_SECRET`: at least 32 random bytes, stored in the platform secret manager.

Never commit production values. Rotate the demo password and signing secret after any suspected exposure. Authentication replacement remains intentionally deferred by product direction.

## Release

1. Restore the latest backup into a disposable database and run `npm run db:deploy` against it.
2. Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`.
3. Build and scan the container image.
4. Back up production, then run `npm run db:deploy` as a one-off release job.
5. Deploy one instance, confirm `/health`, sign in, and complete the smoke checklist in `CURRENT_HANDOFF.md`.
6. Scale to the event-night replica count and run `LOAD_TARGET_URL=https://your-domain npm run verify:load`.
7. Roll back the application image if needed. Database migrations are forward-only; restore the pre-release backup only after preserving incident data.

## Operations

- Alert when `/health` fails twice, HTTP 5xx exceeds 1% for five minutes, PostgreSQL connections exceed 80%, or p95 response time exceeds one second.
- Capture structured platform request logs without query strings so bearer tokens are never logged.
- Retain application logs for 30 days and audit records according to the organization's data policy.
- Test a backup restore monthly and before every schema release.
- Scale and load-test with expected check-in station concurrency before each large event.

## Offline decision

Cold offline page loading is not an MVP requirement. Gather guarantees durable queued attendance intent and cached registrant search after the check-in workspace has loaded. Staff must open the workspace while connected before event operations begin. A service-worker app shell remains a later enhancement because it adds cache invalidation and release-safety obligations without improving the server-authoritative queue contract.
