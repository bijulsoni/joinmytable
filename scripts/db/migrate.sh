#!/usr/bin/env bash
# Database agent: apply ordered migrations against a Supabase Postgres URL.
#
# Migrations are idempotent (`create ... if not exists`, enum guards,
# `drop policy if exists`), so re-running this script against an already
# migrated database is a no-op.
#
# Required env: DATABASE_URL  (e.g. postgresql://postgres:PASS@db.<ref>.supabase.co:5432/postgres)
# Optional env: DB_MIGRATIONS_DIR (defaults to ./supabase/migrations)
#
# Usage:
#   DATABASE_URL=... npm run db:migrate
#   DATABASE_URL=... ./scripts/db/migrate.sh

set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  cat >&2 <<'EOS'
db:migrate: DATABASE_URL is not set.

Set it to the Supabase Postgres connection string for the target environment
(dev or staging - production is gated). For Supabase, it looks like:

  postgresql://postgres:<DB_PASSWORD>@db.<PROJECT_REF>.supabase.co:5432/postgres

Then re-run:  DATABASE_URL=... npm run db:migrate
EOS
  exit 2
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "db:migrate: psql is not installed. Install the postgres client (brew install libpq or postgresql) and ensure psql is on PATH." >&2
  exit 2
fi

MIG_DIR="${DB_MIGRATIONS_DIR:-supabase/migrations}"
if [ ! -d "$MIG_DIR" ]; then
  echo "db:migrate: migrations directory not found: $MIG_DIR" >&2
  exit 2
fi

shopt -s nullglob
FILES=( "$MIG_DIR"/*.sql )
if [ ${#FILES[@]} -eq 0 ]; then
  echo "db:migrate: no .sql files in $MIG_DIR" >&2
  exit 2
fi

# Lexicographic order = chronological order thanks to the timestamp prefix.
IFS=$'\n' SORTED=( $(printf '%s\n' "${FILES[@]}" | sort) )
unset IFS

echo "db:migrate: applying ${#SORTED[@]} migration(s) from $MIG_DIR"
for f in "${SORTED[@]}"; do
  echo "  -> $(basename "$f")"
  # ON_ERROR_STOP exits non-zero on the first SQL error.
  # -v ON_ERROR_STOP=1 keeps multi-statement files atomic per-file.
  psql "$DATABASE_URL" \
    -v ON_ERROR_STOP=1 \
    --single-transaction \
    --quiet \
    -f "$f"
done

echo "db:migrate: done."
