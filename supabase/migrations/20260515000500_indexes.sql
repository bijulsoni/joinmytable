-- 20260515000500_indexes.sql
-- Geo and lookup indexes.
-- Owner: Database agent.

-- ---------------------------------------------------------------------------
-- Geo indexes (PostGIS GiST)
-- ---------------------------------------------------------------------------
-- The discovery query is "verified companions whose service area covers
-- (or is within N km of) a point". A GiST index on the geography column
-- makes that scan PostGIS-fast.
create index if not exists companion_profiles_service_area_gix
  on public.companion_profiles
  using gist (service_area_center);

-- Restaurant location is queried less aggressively (e.g. "bookings near
-- this neighborhood"), but the same index pattern applies.
create index if not exists bookings_restaurant_location_gix
  on public.bookings
  using gist (restaurant_location);

create index if not exists meal_requests_proposed_location_gix
  on public.meal_requests
  using gist (proposed_location);

-- ---------------------------------------------------------------------------
-- Foreign-key + lookup indexes
-- ---------------------------------------------------------------------------
-- Discovery filters on verification_status; only verified companions are
-- ever shown, so a partial index keeps this tight.
create index if not exists companion_profiles_verified_idx
  on public.companion_profiles (verification_status)
  where verification_status = 'verified';

create index if not exists availability_by_companion_idx
  on public.availability (companion_user_id, day_of_week, meal_type);

create index if not exists meal_requests_seeker_idx
  on public.meal_requests (seeker_user_id, status, created_at desc);

create index if not exists meal_requests_companion_idx
  on public.meal_requests (companion_user_id, status, created_at desc);

create index if not exists bookings_seeker_idx
  on public.bookings (seeker_user_id, status, scheduled_for desc);

create index if not exists bookings_companion_idx
  on public.bookings (companion_user_id, status, scheduled_for desc);

create index if not exists messages_booking_idx
  on public.messages (booking_id, created_at);

create index if not exists messages_sender_idx
  on public.messages (sender_user_id);

create index if not exists reviews_subject_idx
  on public.reviews (subject_user_id, created_at desc);

create index if not exists reviews_booking_idx
  on public.reviews (booking_id);

create index if not exists payments_intent_idx
  on public.payments (stripe_payment_intent_id);
