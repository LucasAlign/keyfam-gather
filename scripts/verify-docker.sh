#!/usr/bin/env bash
# End-to-end validation of the production container images: build the lean
# `runner` and the `migrator` targets, apply migrations through the migrator,
# boot the runner, and prove it serves live traffic with a reachable database.
#
# Requires a running Docker daemon and a reachable PostgreSQL. By default it
# targets the compose database published on the host; from inside a container
# that is host.docker.internal (Docker Desktop) or the host gateway on Linux.
#
#   AUTH_SESSION_SECRET=... ./scripts/verify-docker.sh
#
# Override DB_HOST / DATABASE_URL for a different database.
set -euo pipefail

RUNNER_IMAGE="gather-runner:verify"
MIGRATOR_IMAGE="gather-migrator:verify"
CONTAINER="gather-runner-verify"
HOST_PORT="${HOST_PORT:-8090}"
DB_HOST="${DB_HOST:-host.docker.internal}"
DATABASE_URL="${DATABASE_URL:-postgresql://gather:gather_dev@${DB_HOST}:5432/gather?schema=public}"
AUTH_SESSION_SECRET="${AUTH_SESSION_SECRET:?AUTH_SESSION_SECRET is required (>=32 chars)}"
BASE_URL="http://127.0.0.1:${HOST_PORT}"

# On Linux, host.docker.internal is not automatic; map it to the host gateway.
ADD_HOST_ARGS=()
if [ "$DB_HOST" = "host.docker.internal" ]; then
  ADD_HOST_ARGS=(--add-host "host.docker.internal:host-gateway")
fi

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "== Building runner image =="
docker build --target runner -t "$RUNNER_IMAGE" .

echo "== Building migrator image =="
docker build --target migrator -t "$MIGRATOR_IMAGE" .

echo "== Applying migrations via migrator image =="
docker run --rm "${ADD_HOST_ARGS[@]}" -e DATABASE_URL="$DATABASE_URL" "$MIGRATOR_IMAGE"

echo "== Starting runner container =="
cleanup
docker run -d --name "$CONTAINER" "${ADD_HOST_ARGS[@]}" \
  -p "${HOST_PORT}:3000" \
  -e DATABASE_URL="$DATABASE_URL" \
  -e AUTH_SESSION_SECRET="$AUTH_SESSION_SECRET" \
  "$RUNNER_IMAGE" >/dev/null

echo "== Waiting for liveness =="
ready=""
for _ in $(seq 1 30); do
  if curl -fsS "${BASE_URL}/healthz" >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
if [ -z "$ready" ]; then
  echo "FAIL: runner did not become live within 30s" >&2
  docker logs "$CONTAINER" >&2 || true
  exit 1
fi

fail=0
assert() { # assert <description> <actual> <expected>
  if [ "$2" = "$3" ]; then
    echo "  ok: $1 ($2)"
  else
    echo "  FAIL: $1 — expected $3, got $2" >&2
    fail=1
  fi
}

echo "== Probing endpoints =="
assert "GET /healthz status" "$(curl -s -o /dev/null -w '%{http_code}' "${BASE_URL}/healthz")" "200"
assert "GET /readyz status (database reachable)" "$(curl -s -o /dev/null -w '%{http_code}' "${BASE_URL}/readyz")" "200"
assert "readyz reports database ok" "$(curl -s "${BASE_URL}/readyz" | grep -o '"database":"ok"' || true)" '"database":"ok"'
assert "GET /login status" "$(curl -s -o /dev/null -w '%{http_code}' "${BASE_URL}/login")" "200"
assert "runner runs as non-root" "$(docker exec "$CONTAINER" id -u)" "1001"

echo "== Image sizes =="
for image in "$RUNNER_IMAGE" "$MIGRATOR_IMAGE"; do
  docker image ls "$image" --format '  {{.Repository}}:{{.Tag}} {{.Size}}'
done

if [ "$fail" -ne 0 ]; then
  echo "Docker image verification FAILED." >&2
  exit 1
fi
echo "Docker image verification PASSED: runner builds, migrator applies migrations, and the runtime image serves liveness/readiness/login as a non-root user."
