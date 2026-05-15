-- 20260515000300_requests_and_bookings.sql
-- Meal requests and the booking lifecycle.
-- Owner: Database agent.

-- ---------------------------------------------------------------------------
-- meal_requests
-- ---------------------------------------------------------------------------
-- A seeker -> companion request. Lives independently from bookings: a
-- request that is declined or expires never becomes a booking. A request
-- that is accepted spawns exactly one booking row.
--
-- The seeker proposes meal_type, time, and (optionally) a location. The
-- companion can accept or decline. Restaurant/budget detail is decided
-- after acceptance and lives on the booking row.
create table if not exists public.meal_requests (
  id                       uuid primary key default gen_random_uuid(),
  seeker_user_id           uuid not null references public.users(id) on delete restrict,
  companion_user_id        uuid not null references public.users(id) on delete restrict,
  meal_type                public.meal_type not null,
  -- Seeker's proposed time and (optional) location at request time.
  -- The booking row stores the final confirmed values.
  proposed_time            timestamptz not null,
  proposed_location_text   text,
  proposed_location        geography(Point, 4326),
  seeker_message           text check (seeker_message is null or char_length(seeker_message) <= 1000),
  status                   public.request_status not null default 'requested',
  decline_reason           text check (decline_reason is null or char_length(decline_reason) <= 500),
  responded_at             timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint meal_requests_seeker_companion_distinct check (seeker_user_id <> companion_user_id)
);

drop trigger if exists set_meal_requests_updated_at on public.meal_requests;
create trigger set_meal_requests_updated_at
before update on public.meal_requests
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- bookings
-- ---------------------------------------------------------------------------
-- Created when a meal_request is accepted. Holds the post-acceptance
-- lifecycle: accepted -> confirmed -> completed (or cancelled).
--
-- companionship_fee_cents is *snapshotted* from the companion's rate at
-- booking creation. The companion may later change their rate; existing
-- bookings keep the price the seeker agreed to.
--
-- The restaurant fields are populated when the booking transitions to
-- confirmed. The seeker also picks a budget_tier at that point (core
-- product rule #4).
create table if not exists public.bookings (
  id                          uuid primary key default gen_random_uuid(),
  request_id                  uuid not null unique references public.meal_requests(id) on delete restrict,
  seeker_user_id              uuid not null references public.users(id) on delete restrict,
  companion_user_id           uuid not null references public.users(id) on delete restrict,
  meal_type                   public.meal_type not null,
  scheduled_for               timestamptz not null,
  -- Restaurant details, populated at the 'confirmed' transition.
  restaurant_name             text,
  restaurant_place_id         text, -- maps provider place id
  restaurant_address          text,
  restaurant_location         geography(Point, 4326),
  -- Budget set by the seeker at confirmation time.
  budget_tier                 public.budget_tier,
  -- Optional explicit cap in cents (e.g. derived from the tier). Useful
  -- for app-level guidance to the companion; not used for charges.
  budget_amount_cents         integer check (budget_amount_cents is null or budget_amount_cents > 0),
  -- Companionship fee snapshot. The fee is what the seeker pays the
  -- platform and what the companion eventually receives (minus the
  -- platform cut). It is NOT the meal bill - the seeker pays the
  -- restaurant directly, in person.
  companionship_fee_cents     integer not null check (companionship_fee_cents > 0),
  fee_currency                char(3) not null default 'USD',
  status                      public.booking_status not null default 'accepted',
  seeker_confirmed_at         timestamptz,
  companion_confirmed_at      timestamptz,
  completed_at                timestamptz,
  cancelled_at                timestamptz,
  cancelled_by                public.cancellation_party,
  cancellation_reason         text check (cancellation_reason is null or char_length(cancellation_reason) <= 1000),
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  constraint bookings_seeker_companion_distinct check (seeker_user_id <> companion_user_id),
  constraint bookings_completed_at_set
    check ((status = 'completed') = (completed_at is not null)),
  constraint bookings_cancellation_set
    check (
      (status = 'cancelled') = (cancelled_at is not null)
      and (cancelled_at is null) = (cancelled_by is null)
    ),
  constraint bookings_confirmed_requires_restaurant
    check (
      status in ('accepted', 'cancelled')
      or (restaurant_name is not null and budget_tier is not null)
    )
);

drop trigger if exists set_bookings_updated_at on public.bookings;
create trigger set_bookings_updated_at
before update on public.bookings
for each row execute function public.set_updated_at();
