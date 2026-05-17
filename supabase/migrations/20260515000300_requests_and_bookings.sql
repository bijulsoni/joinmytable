-- 20260515000300_requests_and_bookings.sql
-- meal_requests and bookings.
-- Owner: Database agent.
--
-- Schema follows CLAUDE.md "Database schema" verbatim. Notable invariants:
--   - activity_type is restricted to the four MVP activities
--     (lunch, dinner, coffee, happy_hour) - core product rule #1.
--   - budget_tier on the request is the seeker-chosen cap symbol
--     ($, $$, $$$) - core product rule #5.
--   - status on meal_requests is requested -> accepted | declined.
--   - status on bookings is confirmed -> completed | cancelled.
--   - Restaurant/venue is required on bookings (NOT NULL) because
--     a booking only exists after the request was accepted and the
--     venue chosen (core product rule #2: public venues only).

-- ---------------------------------------------------------------------------
-- meal_requests
-- ---------------------------------------------------------------------------
-- A seeker -> companion request. Lifecycle ends at 'accepted' (spawns a
-- bookings row) or 'declined'.
create table if not exists public.meal_requests (
  id              uuid primary key default gen_random_uuid(),
  seeker_id       uuid references public.users(id),
  companion_id    uuid references public.users(id),
  activity_type   text not null
    check (activity_type in ('lunch','dinner','coffee','happy_hour')),
  proposed_time   timestamptz not null,
  venue_name      text,
  venue_location  text,
  budget_tier     text check (budget_tier in ('$','$$','$$$')),
  message         text,
  status          text default 'requested'
    check (status in ('requested','accepted','declined')),
  created_at      timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- bookings
-- ---------------------------------------------------------------------------
-- Created when a meal_request is accepted. Holds the post-acceptance
-- lifecycle: confirmed -> completed (escrow releases, reviews unlock) or
-- cancelled (escrow refunds).
--
-- companion_fee is a decimal(10,2) snapshot of the companion's rate for
-- this activity at booking time (core product rule #4); changing rates
-- later must not affect existing bookings.
create table if not exists public.bookings (
  id              uuid primary key default gen_random_uuid(),
  request_id      uuid references public.meal_requests(id),
  activity_type   text not null
    check (activity_type in ('lunch','dinner','coffee','happy_hour')),
  venue_name      text not null,
  venue_location  text not null,
  scheduled_time  timestamptz not null,
  budget_tier     text not null check (budget_tier in ('$','$$','$$$')),
  companion_fee   decimal(10,2) not null,
  status          text default 'confirmed'
    check (status in ('confirmed','completed','cancelled')),
  created_at      timestamptz default now()
);
