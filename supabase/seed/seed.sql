-- supabase/seed/seed.sql
-- Default seed entry point invoked by `npm run db:seed`
-- (scripts/db/seed.sh, DB_SEED_FILE defaults to this file).
--
-- Canonical seed content lives in dev-seed.sql per the Phase-1 contract
-- in agents/agent-database.md. This file is a thin include so the runner
-- contract remains stable while the data lives in the documented path.
--
-- \ir = include relative to the directory containing THIS file, which
-- means `npm run db:seed` works regardless of the caller's CWD.

\ir dev-seed.sql
