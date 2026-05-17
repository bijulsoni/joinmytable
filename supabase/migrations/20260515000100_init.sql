-- 20260515000100_init.sql
-- JoinMyTable bootstrap: extensions + shared helpers.
-- Owner: Database agent.
--
-- CLAUDE.md models every status column as `text` with a CHECK constraint,
-- not Postgres ENUM types, so this file deliberately does NOT create any
-- CREATE TYPE ... AS ENUM. Each table's CHECK constraint is the single
-- source of truth for allowed values; the typescript mirrors live in
-- /lib/types/enums.ts.
--
-- Idempotent: every statement uses IF NOT EXISTS / CREATE OR REPLACE so
-- the file applies cleanly to fresh and existing projects alike.

create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "postgis";    -- geography(Point, 4326) for service area
create extension if not exists "citext";     -- case-insensitive email matching

-- Shared updated_at trigger used by every mutable table.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
