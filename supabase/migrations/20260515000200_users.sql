-- 20260515000200_users.sql
-- users, companion_profiles, availability.
-- Owner: Database agent.
--
-- Schema follows CLAUDE.md "Database schema" verbatim. The one practical
-- addition is that users.id REFERENCES auth.users(id): Supabase Auth
-- issues the UUID at signup, and every RLS policy in 000600 keys off
-- auth.uid() = users.id. The DEFAULT gen_random_uuid() from CLAUDE.md
-- is retained so service-role inserts (tests, admin tooling) still work.

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
-- One row per account. A single user may be a seeker, a companion, or both
-- (core product rule #6). verification_status here is the SEEKER-side
-- identity check; companion_profiles carries its own verified_at gate
-- (core product rule #10).
create table if not exists public.users (
  id                  uuid primary key default gen_random_uuid()
                        references auth.users(id) on delete cascade,
  email               text unique not null,
  name                text not null,
  is_seeker           boolean default true,
  is_companion        boolean default false,
  verification_status text default 'unverified'
    check (verification_status in ('unverified','pending','verified')),
  created_at          timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- companion_profiles
-- ---------------------------------------------------------------------------
-- One row per companion. Created when the user opts into companion mode.
--
-- activities / rates are jsonb maps keyed by the four activity types
-- (lunch, dinner, coffee, happy_hour). Example:
--   activities: { "lunch":true, "coffee":true, "dinner":false, "happy_hour":false }
--   rates:      { "lunch":22, "coffee":12 }
-- The Core API is responsible for validating that the keys are a subset
-- of the four allowed activity types.
--
-- location uses PostGIS geography(Point, 4326); see 000500 for the GIST
-- index that makes "verified companions within N km" queries cheap.
--
-- verified_at IS NULL means unverified -> hidden from discovery
-- (core product rule #10, enforced in RLS).
create table if not exists public.companion_profiles (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references public.users(id) on delete cascade,
  bio             text,
  service_area    text,
  location        geography(Point, 4326),
  activities      jsonb,
  rates           jsonb,
  photo_urls      text[],
  rating_avg      decimal(3,2) default 0,
  verified_at     timestamptz,
  created_at      timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- availability
-- ---------------------------------------------------------------------------
-- A companion's offered windows. day_or_date and time_range are kept as
-- free-form text per CLAUDE.md so callers can express either recurring
-- ("Mon", "weekdays") or one-off ("2026-06-04") slots without a schema
-- change; the Core API normalises before persisting.
--
-- activity_types is a text[] that must be a subset of the four allowed
-- activity types; the Core API validates on insert.
create table if not exists public.availability (
  id                    uuid primary key default gen_random_uuid(),
  companion_profile_id  uuid references public.companion_profiles(id) on delete cascade,
  day_or_date           text not null,
  time_range            text not null,
  activity_types        text[]
);
