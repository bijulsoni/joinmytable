-- 20260515000200_users.sql
-- Users, companion profiles, and companion availability windows.
-- Owner: Database agent.

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
-- Mirrors auth.users 1:1. id is the same UUID Supabase Auth issues, which
-- lets every other table reference users.id without ever leaking auth rows
-- to the API surface.
--
-- A single user row may be a seeker, a companion, or both (one account,
-- two modes - core product rule #5).
create table if not exists public.users (
  id                          uuid primary key references auth.users(id) on delete cascade,
  email                       citext not null,
  display_name                text not null check (char_length(display_name) between 1 and 80),
  bio                         text check (bio is null or char_length(bio) <= 2000),
  avatar_path                 text, -- Supabase Storage path; Auth & Identity agent uploads.
  is_seeker                   boolean not null default true,
  is_companion                boolean not null default false,
  seeker_verification_status  public.verification_status not null default 'unverified',
  languages                   text[] not null default '{}',
  interests                   text[] not null default '{}',
  dietary_preferences         text[] not null default '{}',
  guidelines_accepted_at      timestamptz,
  -- Soft-delete column. The Trust & Safety agent may use this when a user
  -- is removed; the row is kept so historical bookings/reviews still resolve.
  deleted_at                  timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  -- A user must operate in at least one mode.
  constraint users_at_least_one_mode check (is_seeker or is_companion),
  constraint users_email_unique unique (email)
);

drop trigger if exists set_users_updated_at on public.users;
create trigger set_users_updated_at
before update on public.users
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- companion_profiles
-- ---------------------------------------------------------------------------
-- One row per companion (1:1 with users). Created only when the user
-- opts into companion mode.
--
-- service_area_center + service_radius_m define the geography of where this
-- companion will meet seekers. PostGIS lets discovery answer "companions
-- within N km of this point" efficiently (see the geo index in the indexes
-- migration).
--
-- rate_cents is the fixed companionship fee the companion will be paid per
-- meal (core product rule #3 - "fixed rate set by the companion, ~$20-25").
-- The free meal is a perk, not the payment.
create table if not exists public.companion_profiles (
  user_id                     uuid primary key references public.users(id) on delete cascade,
  headline                    text check (headline is null or char_length(headline) <= 120),
  bio_long                    text check (bio_long is null or char_length(bio_long) <= 4000),
  rate_cents                  integer not null check (rate_cents between 500 and 20000), -- $5.00 - $200.00
  rate_currency               char(3) not null default 'USD',
  meal_types                  public.meal_type[] not null default array['lunch','dinner']::public.meal_type[],
  service_area_center         geography(Point, 4326) not null,
  service_radius_m            integer not null check (service_radius_m between 500 and 100000), -- 0.5 - 100 km
  verification_status         public.verification_status not null default 'unverified',
  verified_at                 timestamptz,
  -- Stripe Connect connected-account fields. Payments agent owns the
  -- semantics; the columns live here because they are 1:1 with the
  -- companion identity.
  stripe_connect_account_id   text unique,
  stripe_payouts_enabled      boolean not null default false,
  -- Denormalized rating roll-up so the discovery list does not have to
  -- aggregate per-row. Maintained by Core API on review submit.
  avg_rating                  numeric(3, 2) check (avg_rating is null or (avg_rating >= 1.0 and avg_rating <= 5.0)),
  rating_count                integer not null default 0 check (rating_count >= 0),
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  constraint companion_profiles_meal_types_nonempty check (array_length(meal_types, 1) >= 1),
  -- 'verified' must coincide with a verified_at timestamp.
  constraint companion_profiles_verified_at_set
    check ((verification_status = 'verified') = (verified_at is not null))
);

drop trigger if exists set_companion_profiles_updated_at on public.companion_profiles;
create trigger set_companion_profiles_updated_at
before update on public.companion_profiles
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- availability
-- ---------------------------------------------------------------------------
-- A companion's recurring weekly availability windows. Discovery filters
-- against these; the booking flow validates that a chosen slot falls
-- inside one.
--
-- Modeled as recurring (day_of_week + time band) rather than concrete
-- calendar slots so a companion configures once.
create table if not exists public.availability (
  id                 uuid primary key default gen_random_uuid(),
  companion_user_id  uuid not null references public.companion_profiles(user_id) on delete cascade,
  day_of_week        smallint not null check (day_of_week between 0 and 6), -- 0 = Sunday
  start_time         time not null,
  end_time           time not null,
  meal_type          public.meal_type not null,
  -- IANA timezone string, e.g. 'America/Los_Angeles'. Stored per-window so
  -- a companion who travels can keep separate schedules.
  timezone           text not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint availability_window_order check (end_time > start_time)
);

drop trigger if exists set_availability_updated_at on public.availability;
create trigger set_availability_updated_at
before update on public.availability
for each row execute function public.set_updated_at();
