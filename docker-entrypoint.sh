#!/bin/sh
set -e

# Apply committed migrations only when explicitly requested, so that a single
# release step (or init container) migrates while app replicas start without
# racing each other. Never runs `migrate dev`.
if [ "$RUN_MIGRATIONS" = "true" ]; then
  echo "Applying database migrations..."
  node node_modules/prisma/build/index.js migrate deploy
fi

exec "$@"
