#!/usr/bin/env bash
# Database agent: load seed data into a dev or staging database.
#
# NEVER run this against production. The script refuses if APP_ENV=production.
#
# Required env: DATABASE_URL
# Optional env: APP_ENV (must be 'development' or 'staging' to proceed)
#               DB_SEED_FILE (defaults to ./supabase/seed/seed.sql)

set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "db:seed: DATABASE_URL is not set. Refusing to run." >&2
  exit 2
fi

case "${APP_ENV:-development}" in
  production)
    echo "db:seed: APP_ENV=production - seed data must never be loaded into production. Aborting." >&2
    exit 3
    ;;
  development|staging|test)
    ;;
  *)
    echo "db:seed: APP_ENV='${APP_ENV}' is not recognised. Set APP_ENV=development or APP_ENV=staging." >&2
    exit 2
    ;;
esac

if ! command -v psql >/dev/null 2>&1; then
  echo "db:seed: psql is not installed. Install the postgres client (brew install libpq or postgresql) and ensure psql is on PATH." >&2
  exit 2
fi

SEED_FILE="${DB_SEED_FILE:-supabase/seed/seed.sql}"
if [ ! -f "$SEED_FILE" ]; then
  echo "db:seed: seed file not found: $SEED_FILE" >&2
  exit 2
fi

echo "db:seed: loading $SEED_FILE into ${APP_ENV:-development} database"
psql "$DATABASE_URL" \
  -v ON_ERROR_STOP=1 \
  --single-transaction \
  --quiet \
  -f "$SEED_FILE"

echo "db:seed: done."
