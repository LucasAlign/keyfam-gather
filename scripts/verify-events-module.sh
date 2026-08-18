#!/usr/bin/env bash
# ============================================================================
# verify-events-module.sh
# ----------------------------------------------------------------------------
# Validates docs/aligncore-events-module.sql against a real PostgreSQL by:
#   1. applying the DDL (with the minimal Align Core `users`/`audit_log` stubs
#      the module depends on),
#   2. running docs/aligncore-events-module.verify.sql (structure + behavior
#      assertions; any failure aborts with a non-zero exit).
#
# Two modes:
#   * If DATABASE_URL / PG* point at a reachable Postgres, it uses that (it
#     creates and then DROPs a scratch schema-load in a throwaway database name
#     you pass as $VERIFY_DB, default `events_module_verify`).
#   * Otherwise, if local Postgres server binaries exist, it spins up a
#     throwaway cluster in a temp dir and tears it down at the end.
#
# Usage:
#   scripts/verify-events-module.sh                 # auto (throwaway cluster)
#   PGHOST=127.0.0.1 PGUSER=gather PGPASSWORD=gather_dev \
#     scripts/verify-events-module.sh               # against a running server
# ============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DDL="$ROOT/docs/aligncore-events-module.sql"
CHECKS="$ROOT/docs/aligncore-events-module.verify.sql"
VERIFY_DB="${VERIFY_DB:-events_module_verify}"

STUBS_SQL="
CREATE TABLE IF NOT EXISTS users (
  user_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email   VARCHAR(255) UNIQUE NOT NULL);
CREATE TABLE IF NOT EXISTS audit_log (
  audit_id    INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     INT REFERENCES users(user_id),
  action_name VARCHAR(255) NOT NULL,
  details     TEXT,
  time_stamp  TIMESTAMPTZ DEFAULT now());
"

run_checks() { # $1 = psql base args (array via string is awkward; use function refs)
  psql "$@" -v ON_ERROR_STOP=1 -q -c "$STUBS_SQL"
  psql "$@" -v ON_ERROR_STOP=1 -f "$DDL" >/dev/null
  psql "$@" -v ON_ERROR_STOP=1 -f "$CHECKS"
}

# --- Mode 1: an external server is configured -------------------------------
if [[ -n "${PGHOST:-}${DATABASE_URL:-}" ]]; then
  echo "==> Using configured PostgreSQL (creating throwaway db: $VERIFY_DB)"
  createdb "$VERIFY_DB"
  trap 'dropdb --if-exists "$VERIFY_DB" >/dev/null 2>&1 || true' EXIT
  run_checks -d "$VERIFY_DB"
  echo "==> OK"
  exit 0
fi

# --- Mode 2: throwaway local cluster ----------------------------------------
PGBIN="$(dirname "$(command -v initdb || ls /usr/lib/postgresql/*/bin/initdb 2>/dev/null | sort -V | tail -1)")"
if [[ -z "$PGBIN" || ! -x "$PGBIN/initdb" ]]; then
  echo "ERROR: no PostgreSQL server binaries found (initdb). Install postgresql, or point PGHOST/DATABASE_URL at a running server." >&2
  exit 2
fi

WORK="$(mktemp -d)"
PGDATA="$WORK/data"; PGSOCK="$WORK/sock"; mkdir -p "$PGSOCK"
cleanup() { "$PGBIN/pg_ctl" -D "$PGDATA" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT

echo "==> Initializing throwaway cluster ($($PGBIN/postgres --version))"
"$PGBIN/initdb" -D "$PGDATA" -U gather --auth=trust >/dev/null
"$PGBIN/pg_ctl" -D "$PGDATA" -o "-c listen_addresses='' -k $PGSOCK" -w -l "$WORK/pg.log" start >/dev/null
"$PGBIN/createdb" -h "$PGSOCK" -U gather "$VERIFY_DB"

echo "==> Applying DDL + running checks"
run_checks -h "$PGSOCK" -U gather -d "$VERIFY_DB"
echo "==> OK"
