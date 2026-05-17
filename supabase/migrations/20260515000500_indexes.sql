-- 20260515000500_indexes.sql
-- Geo and lookup indexes.
-- Owner: Database agent.
--
-- These cover the hot paths in CLAUDE.md's task list:
--   - Discovery: "verified companions within N km of point" (GIST geo
--     index + partial verified index).
--   - Request inbox: by seeker_id, by companion_id, optionally filtered
--     by activity_type.
--   - Booking lists: by status (open vs completed vs cancelled).
--   - Chat: messages by booking_id, in arrival order.
--   - Profile rating roll-ups: reviews by reviewee_id.

-- ---------------------------------------------------------------------------
-- Geo (PostGIS GiST)
-- ---------------------------------------------------------------------------
create index if not exists companion_profiles_location_gix
  on public.companion_profiles using gist (location);

-- ---------------------------------------------------------------------------
-- Discovery filters
-- ---------------------------------------------------------------------------
-- Partial index: only verified companions are ever shown
-- (core product rule #10), so the index stays small and the discovery
-- query plan is trivial.
create index if not exists companion_profiles_verified_idx
  on public.companion_profiles (verified_at)
  where verified_at is not null;

-- ---------------------------------------------------------------------------
-- meal_requests
-- ---------------------------------------------------------------------------
create index if not exists meal_requests_seeker_idx
  on public.meal_requests (seeker_id, created_at desc);

create index if not exists meal_requests_companion_idx
  on public.meal_requests (companion_id, created_at desc);

create index if not exists meal_requests_activity_type_idx
  on public.meal_requests (activity_type);

-- ---------------------------------------------------------------------------
-- bookings
-- ---------------------------------------------------------------------------
create index if not exists bookings_status_idx
  on public.bookings (status);

-- ---------------------------------------------------------------------------
-- messages
-- ---------------------------------------------------------------------------
create index if not exists messages_booking_idx
  on public.messages (booking_id, sent_at);

-- ---------------------------------------------------------------------------
-- reviews
-- ---------------------------------------------------------------------------
-- For aggregating per-companion (or per-seeker) ratings.
create index if not exists reviews_reviewee_idx
  on public.reviews (reviewee_id, created_at desc);
