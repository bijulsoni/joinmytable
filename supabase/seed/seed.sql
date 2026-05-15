-- supabase/seed/seed.sql
-- Development + staging seed data for JoinMyTable.
-- Owner: Database agent.
--
-- Intended to be applied AFTER migrations against the development and
-- staging Supabase projects. Production NEVER runs this file.
--
-- The script is idempotent: running it twice produces the same dataset.
-- It uses fixed UUIDs and ON CONFLICT DO NOTHING throughout.
--
-- Auth users are created with password "Password123!" so devs can sign in
-- as any seed account locally. Email confirmation is pre-marked complete.
-- DO NOT reuse these credentials in production.

begin;

-- ---------------------------------------------------------------------------
-- Auth users
-- ---------------------------------------------------------------------------
-- Direct insert into auth.users is the supported supabase-local seeding
-- pattern. Production auth flows still go through Supabase Auth.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  ('00000000-0000-0000-0000-000000000000',
   '11111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated',
   'ava.seeker@joinmytable.test',
   crypt('Password123!', gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000',
   '22222222-2222-2222-2222-222222222222',
   'authenticated', 'authenticated',
   'ben.companion@joinmytable.test',
   crypt('Password123!', gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000',
   '33333333-3333-3333-3333-333333333333',
   'authenticated', 'authenticated',
   'cleo.both@joinmytable.test',
   crypt('Password123!', gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000',
   '44444444-4444-4444-4444-444444444444',
   'authenticated', 'authenticated',
   'dan.unverified@joinmytable.test',
   crypt('Password123!', gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
   now(), now(), '', '', '', '')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Public users (mirror)
-- ---------------------------------------------------------------------------
insert into public.users (
  id, email, display_name, bio, is_seeker, is_companion,
  seeker_verification_status, languages, interests, dietary_preferences,
  guidelines_accepted_at
) values
  ('11111111-1111-1111-1111-111111111111',
   'ava.seeker@joinmytable.test', 'Ava',
   'Travelling consultant who hates eating alone on the road.',
   true, false, 'verified',
   array['en','es'], array['food','jazz','running'], array['vegetarian'],
   now()),
  ('22222222-2222-2222-2222-222222222222',
   'ben.companion@joinmytable.test', 'Ben',
   'Lifelong San Franciscan, knows every dim sum spot.',
   false, true, 'unverified',
   array['en','zh'], array['food','cycling','art'], array[]::text[],
   now()),
  ('33333333-3333-3333-3333-333333333333',
   'cleo.both@joinmytable.test', 'Cleo',
   'Splits time between Berlin and SF; hosts at home, seeks abroad.',
   true, true, 'verified',
   array['en','de'], array['food','books','hiking'], array['pescatarian'],
   now()),
  ('44444444-4444-4444-4444-444444444444',
   'dan.unverified@joinmytable.test', 'Dan',
   'New companion still completing verification.',
   false, true, 'unverified',
   array['en'], array['food','soccer'], array[]::text[],
   now())
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Companion profiles
-- ---------------------------------------------------------------------------
-- Two verified companions (Ben, Cleo) + one pending (Dan). RLS will hide
-- Dan from discovery, which is the desired behaviour.
insert into public.companion_profiles (
  user_id, headline, bio_long, rate_cents, rate_currency,
  meal_types, service_area_center, service_radius_m,
  verification_status, verified_at,
  stripe_connect_account_id, stripe_payouts_enabled,
  avg_rating, rating_count
) values
  ('22222222-2222-2222-2222-222222222222',
   'Your San Francisco dining companion',
   'I have been eating my way through SF since 2005 and love showing visitors the real city - the dim sum, the bakeries, the dive bars.',
   2200, 'USD',
   array['lunch','dinner']::public.meal_type[],
   ST_SetSRID(ST_MakePoint(-122.4194, 37.7749), 4326)::geography, -- SF City Hall
   8000,
   'verified', now() - interval '30 days',
   'acct_test_ben', true,
   4.80, 12),
  ('33333333-3333-3333-3333-333333333333',
   'Berlin + SF, lunch is my favourite meeting',
   'I split my time between Kreuzberg and the Mission. Happy to talk shop, books, or just listen.',
   2500, 'USD',
   array['lunch','dinner']::public.meal_type[],
   ST_SetSRID(ST_MakePoint(-122.4148, 37.7599), 4326)::geography, -- The Mission
   5000,
   'verified', now() - interval '45 days',
   'acct_test_cleo', true,
   4.95, 7),
  ('44444444-4444-4444-4444-444444444444',
   'Just getting started',
   'Verification in progress.',
   2000, 'USD',
   array['lunch']::public.meal_type[],
   ST_SetSRID(ST_MakePoint(-122.4477, 37.8076), 4326)::geography, -- Presidio
   4000,
   'pending', null,
   null, false,
   null, 0)
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- Availability
-- ---------------------------------------------------------------------------
-- Ben: every weekday lunch + Fri/Sat dinner.
-- Cleo: Tue/Thu lunch + Sun brunch-equivalent lunch.
insert into public.availability (
  id, companion_user_id, day_of_week, start_time, end_time, meal_type, timezone
) values
  ('aaaaaaa1-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
   1, '12:00', '14:00', 'lunch',  'America/Los_Angeles'),
  ('aaaaaaa2-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
   2, '12:00', '14:00', 'lunch',  'America/Los_Angeles'),
  ('aaaaaaa3-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
   3, '12:00', '14:00', 'lunch',  'America/Los_Angeles'),
  ('aaaaaaa4-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
   4, '12:00', '14:00', 'lunch',  'America/Los_Angeles'),
  ('aaaaaaa5-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
   5, '19:00', '22:00', 'dinner', 'America/Los_Angeles'),
  ('aaaaaaa6-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
   6, '19:00', '22:00', 'dinner', 'America/Los_Angeles'),
  ('bbbbbbb1-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333',
   2, '12:00', '14:30', 'lunch',  'America/Los_Angeles'),
  ('bbbbbbb2-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333',
   4, '12:00', '14:30', 'lunch',  'America/Los_Angeles'),
  ('bbbbbbb3-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333',
   0, '11:30', '14:00', 'lunch',  'America/Los_Angeles')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- A representative happy-path booking (accepted request -> completed)
-- ---------------------------------------------------------------------------
-- Ava (seeker) requested Ben (companion). Accepted, confirmed, completed.
insert into public.meal_requests (
  id, seeker_user_id, companion_user_id, meal_type,
  proposed_time, proposed_location_text, proposed_location,
  seeker_message, status, responded_at, created_at
) values
  ('99999999-aaaa-aaaa-aaaa-000000000001',
   '11111111-1111-1111-1111-111111111111',
   '22222222-2222-2222-2222-222222222222',
   'lunch',
   now() - interval '10 days', 'Mission, SF',
   ST_SetSRID(ST_MakePoint(-122.4148, 37.7599), 4326)::geography,
   'Hi Ben - in town for the week, would love a local lunch.',
   'accepted', now() - interval '10 days' + interval '2 hours',
   now() - interval '10 days')
on conflict (id) do nothing;

insert into public.bookings (
  id, request_id, seeker_user_id, companion_user_id, meal_type,
  scheduled_for, restaurant_name, restaurant_place_id, restaurant_address,
  restaurant_location, budget_tier, budget_amount_cents,
  companionship_fee_cents, fee_currency, status,
  seeker_confirmed_at, companion_confirmed_at, completed_at,
  created_at
) values
  ('99999999-bbbb-bbbb-bbbb-000000000001',
   '99999999-aaaa-aaaa-aaaa-000000000001',
   '11111111-1111-1111-1111-111111111111',
   '22222222-2222-2222-2222-222222222222',
   'lunch',
   now() - interval '8 days',
   'Tartine Manufactory', 'place_tartine_sf', '595 Alabama St, San Francisco, CA',
   ST_SetSRID(ST_MakePoint(-122.4108, 37.7621), 4326)::geography,
   'medium', 5000,
   2200, 'USD',
   'completed',
   now() - interval '9 days', now() - interval '9 days',
   now() - interval '8 days' + interval '90 minutes',
   now() - interval '10 days' + interval '2 hours')
on conflict (id) do nothing;

-- Payment row showing the released-from-escrow happy path.
insert into public.payments (
  id, booking_id, amount_cents, platform_fee_cents, currency,
  stripe_payment_intent_id, stripe_charge_id, stripe_transfer_id,
  payment_status, escrow_status, captured_at, released_at
) values
  ('99999999-cccc-cccc-cccc-000000000001',
   '99999999-bbbb-bbbb-bbbb-000000000001',
   2200, 330, 'USD',
   'pi_test_seed_001', 'ch_test_seed_001', 'tr_test_seed_001',
   'released', 'released',
   now() - interval '9 days', now() - interval '8 days' + interval '2 hours')
on conflict (id) do nothing;

-- A couple of messages on that booking, including a system entry.
insert into public.messages (id, booking_id, sender_user_id, message_type, body, created_at) values
  ('99999999-dddd-dddd-dddd-000000000001',
   '99999999-bbbb-bbbb-bbbb-000000000001',
   null, 'system', 'Booking accepted. Chat is now open.',
   now() - interval '10 days' + interval '2 hours'),
  ('99999999-dddd-dddd-dddd-000000000002',
   '99999999-bbbb-bbbb-bbbb-000000000001',
   '22222222-2222-2222-2222-222222222222', 'user',
   'Looking forward to it - Tartine works great for me.',
   now() - interval '10 days' + interval '3 hours'),
  ('99999999-dddd-dddd-dddd-000000000003',
   '99999999-bbbb-bbbb-bbbb-000000000001',
   '11111111-1111-1111-1111-111111111111', 'user',
   'Perfect, see you at 12:30.',
   now() - interval '9 days')
on conflict (id) do nothing;

-- Two-way reviews after completion.
insert into public.reviews (
  id, booking_id, author_user_id, subject_user_id, subject_type, rating, body
) values
  ('99999999-eeee-eeee-eeee-000000000001',
   '99999999-bbbb-bbbb-bbbb-000000000001',
   '11111111-1111-1111-1111-111111111111',
   '22222222-2222-2222-2222-222222222222',
   'companion', 5, 'Ben was wonderful - great conversation, excellent restaurant pick.'),
  ('99999999-eeee-eeee-eeee-000000000002',
   '99999999-bbbb-bbbb-bbbb-000000000001',
   '22222222-2222-2222-2222-222222222222',
   '11111111-1111-1111-1111-111111111111',
   'seeker', 5, 'Ava was easy to chat with, would meet again.')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- A pending request showing the pre-acceptance state
-- ---------------------------------------------------------------------------
insert into public.meal_requests (
  id, seeker_user_id, companion_user_id, meal_type,
  proposed_time, proposed_location_text, proposed_location,
  seeker_message, status, created_at
) values
  ('99999999-aaaa-aaaa-aaaa-000000000002',
   '33333333-3333-3333-3333-333333333333', -- Cleo in seeker mode
   '22222222-2222-2222-2222-222222222222', -- requesting Ben
   'dinner',
   now() + interval '3 days', 'North Beach',
   ST_SetSRID(ST_MakePoint(-122.4079, 37.8060), 4326)::geography,
   'In SF this week - dinner Friday?',
   'requested', now() - interval '1 hour')
on conflict (id) do nothing;

commit;
