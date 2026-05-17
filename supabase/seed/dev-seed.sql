-- supabase/seed/dev-seed.sql
-- Development + staging seed data for JoinMyTable.
-- Owner: Database agent.
--
-- Applied AFTER the migrations in supabase/migrations/ via
-- `npm run db:seed`. Production NEVER runs this file (scripts/db/seed.sh
-- refuses APP_ENV=production).
--
-- Idempotent: fixed UUIDs + ON CONFLICT DO NOTHING throughout, safe to
-- re-run. All seed accounts share password "Password123!" - DO NOT reuse
-- these credentials anywhere outside local/dev.
--
-- Dataset shape (matches the QA scenarios called out in
-- agents/agent-database.md task 7):
--
--   Seekers (3): Ava, Bo, Cara
--   Companions (4):
--     verified   - Dev   (lunch + coffee)
--     verified   - Eli   (dinner + happy_hour)
--     unverified - Finn  (lunch + dinner)        <- hidden by RLS
--     unverified - Gia   (coffee + happy_hour)   <- hidden by RLS
--   All four activity types (lunch / dinner / coffee / happy_hour) are
--   covered across the verified companions.
--
--   Bookings: 2 completed (Ava-Dev lunch, Bo-Eli dinner), each with a
--   payment row showing released escrow, system + user chat messages,
--   and a two-way review.
--
--   Plus 1 pending request (Cara -> Dev coffee) so dashboards have
--   something pre-acceptance to render.

begin;

-- ---------------------------------------------------------------------------
-- 1. Auth users
-- ---------------------------------------------------------------------------
-- Direct insert into auth.users is the supported supabase-local seeding
-- pattern. Production auth flows still go through Supabase Auth proper.
-- pgcrypto (crypt/gen_salt) is enabled by 20260515000100_init.sql.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  -- Seekers
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'ava.seeker@joinmytable.test',
   crypt('Password123!', gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111112',
   'authenticated', 'authenticated', 'bo.seeker@joinmytable.test',
   crypt('Password123!', gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111113',
   'authenticated', 'authenticated', 'cara.seeker@joinmytable.test',
   crypt('Password123!', gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
   now(), now(), '', '', '', ''),
  -- Companions: verified
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222221',
   'authenticated', 'authenticated', 'dev.companion@joinmytable.test',
   crypt('Password123!', gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222',
   'authenticated', 'authenticated', 'eli.companion@joinmytable.test',
   crypt('Password123!', gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
   now(), now(), '', '', '', ''),
  -- Companions: unverified
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333331',
   'authenticated', 'authenticated', 'finn.unverified@joinmytable.test',
   crypt('Password123!', gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333332',
   'authenticated', 'authenticated', 'gia.unverified@joinmytable.test',
   crypt('Password123!', gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
   now(), now(), '', '', '', '')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. public.users (mirror of auth.users by id)
-- ---------------------------------------------------------------------------
insert into public.users (id, email, name, is_seeker, is_companion, verification_status) values
  ('11111111-1111-1111-1111-111111111111', 'ava.seeker@joinmytable.test',  'Ava',  true,  false, 'verified'),
  ('11111111-1111-1111-1111-111111111112', 'bo.seeker@joinmytable.test',   'Bo',   true,  false, 'verified'),
  ('11111111-1111-1111-1111-111111111113', 'cara.seeker@joinmytable.test', 'Cara', true,  false, 'pending'),
  ('22222222-2222-2222-2222-222222222221', 'dev.companion@joinmytable.test', 'Dev', false, true, 'verified'),
  ('22222222-2222-2222-2222-222222222222', 'eli.companion@joinmytable.test', 'Eli', false, true, 'verified'),
  ('33333333-3333-3333-3333-333333333331', 'finn.unverified@joinmytable.test', 'Finn', false, true, 'unverified'),
  ('33333333-3333-3333-3333-333333333332', 'gia.unverified@joinmytable.test',  'Gia',  false, true, 'unverified')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. companion_profiles
-- ---------------------------------------------------------------------------
-- The verified pair (Dev, Eli) covers all four activity types between them.
-- The unverified pair (Finn, Gia) is hidden from discovery by RLS - they
-- exist so QA can prove the verified_at gate works.
--
-- location uses geography(Point, 4326) via ST_MakePoint(lon, lat).
-- activities/rates are jsonb maps keyed by ActivityType.
insert into public.companion_profiles (
  id, user_id, bio, service_area, location, activities, rates,
  photo_urls, rating_avg, verified_at
) values
  -- Dev: verified, lunch + coffee, Mission SF
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01',
   '22222222-2222-2222-2222-222222222221',
   'Software engineer by day, deeply opinionated about Mission burritos.',
   'San Francisco - Mission / SoMa',
   ST_SetSRID(ST_MakePoint(-122.4148, 37.7599), 4326)::geography,
   '{"lunch": true, "coffee": true, "dinner": false, "happy_hour": false}'::jsonb,
   '{"lunch": 22, "coffee": 12}'::jsonb,
   array['https://placehold.co/600x400?text=Dev'],
   4.80,
   now() - interval '30 days'),
  -- Eli: verified, dinner + happy_hour, North Beach
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa02',
   '22222222-2222-2222-2222-222222222222',
   'Twenty years in the city, knows every Italian place worth visiting.',
   'San Francisco - North Beach / Russian Hill',
   ST_SetSRID(ST_MakePoint(-122.4079, 37.8060), 4326)::geography,
   '{"lunch": false, "coffee": false, "dinner": true, "happy_hour": true}'::jsonb,
   '{"dinner": 25, "happy_hour": 22}'::jsonb,
   array['https://placehold.co/600x400?text=Eli'],
   4.95,
   now() - interval '45 days'),
  -- Finn: unverified, lunch + dinner, Sunset
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa03',
   '33333333-3333-3333-3333-333333333331',
   'Verification in progress.',
   'San Francisco - Sunset',
   ST_SetSRID(ST_MakePoint(-122.4862, 37.7558), 4326)::geography,
   '{"lunch": true, "dinner": true, "coffee": false, "happy_hour": false}'::jsonb,
   '{"lunch": 20, "dinner": 22}'::jsonb,
   array[]::text[],
   0,
   null),
  -- Gia: unverified, coffee + happy_hour, Hayes Valley
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa04',
   '33333333-3333-3333-3333-333333333332',
   'Just joined - waiting on ID review.',
   'San Francisco - Hayes Valley',
   ST_SetSRID(ST_MakePoint(-122.4257, 37.7762), 4326)::geography,
   '{"coffee": true, "happy_hour": true, "lunch": false, "dinner": false}'::jsonb,
   '{"coffee": 10, "happy_hour": 20}'::jsonb,
   array[]::text[],
   0,
   null)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 4. availability
-- ---------------------------------------------------------------------------
-- day_or_date and time_range are free-form text per CLAUDE.md so we can
-- carry both recurring weekdays ("Mon") and one-off dates without a
-- schema change. activity_types is a text[] - the Core API validates it
-- is a subset of the four ActivityType values.
insert into public.availability (
  id, companion_profile_id, day_or_date, time_range, activity_types
) values
  -- Dev (verified, lunch + coffee)
  ('a1111111-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01',
   'Mon', '12:00-14:00', array['lunch']),
  ('a1111111-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01',
   'Tue', '12:00-14:00', array['lunch']),
  ('a1111111-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01',
   'Wed', '12:00-14:00', array['lunch']),
  ('a1111111-0000-0000-0000-000000000004', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01',
   'Sat', '09:00-11:00', array['coffee']),
  -- Eli (verified, dinner + happy_hour)
  ('a2222222-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa02',
   'Thu', '17:00-19:00', array['happy_hour']),
  ('a2222222-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa02',
   'Fri', '19:00-22:00', array['dinner']),
  ('a2222222-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa02',
   'Sat', '19:00-22:00', array['dinner','happy_hour']),
  -- Finn (unverified, lunch + dinner)
  ('a3333333-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa03',
   'weekdays', '12:00-14:00', array['lunch']),
  ('a3333333-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa03',
   'Sun', '18:30-20:30', array['dinner']),
  -- Gia (unverified, coffee + happy_hour)
  ('a4444444-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa04',
   'weekdays', '08:00-10:00', array['coffee']),
  ('a4444444-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa04',
   'Fri', '17:00-19:00', array['happy_hour'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 5. Completed booking #1: Ava (seeker) <-> Dev (companion), lunch
-- ---------------------------------------------------------------------------
-- request -> accepted -> bookings row created server-side -> completed.
-- Escrow released, two-way review left.

-- Accepted meal_request
insert into public.meal_requests (
  id, seeker_id, companion_id, activity_type, proposed_time,
  venue_name, venue_location, budget_tier, message, status, created_at
) values
  ('b1111111-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111',  -- Ava
   '22222222-2222-2222-2222-222222222221',  -- Dev
   'lunch',
   now() - interval '8 days',
   'Tartine Manufactory', '595 Alabama St, San Francisco, CA',
   '$$',
   'In town this week - would love a Mission lunch.',
   'accepted',
   now() - interval '10 days')
on conflict (id) do nothing;

insert into public.bookings (
  id, request_id, activity_type, venue_name, venue_location,
  scheduled_time, budget_tier, companion_fee, status, created_at
) values
  ('c1111111-0000-0000-0000-000000000001',
   'b1111111-0000-0000-0000-000000000001',
   'lunch',
   'Tartine Manufactory', '595 Alabama St, San Francisco, CA',
   now() - interval '8 days',
   '$$',
   22.00,
   'completed',
   now() - interval '10 days' + interval '2 hours')
on conflict (id) do nothing;

insert into public.payments (
  id, booking_id, fee_amount, platform_cut, escrow_status,
  stripe_payment_intent_id, stripe_transfer_id
) values
  ('d1111111-0000-0000-0000-000000000001',
   'c1111111-0000-0000-0000-000000000001',
   22.00, 3.30, 'released',
   'pi_test_seed_001', 'tr_test_seed_001')
on conflict (id) do nothing;

insert into public.messages (id, booking_id, sender_id, body, is_system_message, sent_at) values
  ('e1111111-0000-0000-0000-000000000001',
   'c1111111-0000-0000-0000-000000000001',
   null, 'Booking confirmed. Chat is now open.',
   true,
   now() - interval '10 days' + interval '2 hours'),
  ('e1111111-0000-0000-0000-000000000002',
   'c1111111-0000-0000-0000-000000000001',
   '22222222-2222-2222-2222-222222222221',  -- Dev
   'Tartine works great for me - see you at 12:30.',
   false,
   now() - interval '10 days' + interval '3 hours'),
  ('e1111111-0000-0000-0000-000000000003',
   'c1111111-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111',  -- Ava
   'Perfect, looking forward to it.',
   false,
   now() - interval '9 days')
on conflict (id) do nothing;

insert into public.reviews (id, booking_id, reviewer_id, reviewee_id, rating, comment) values
  ('f1111111-0000-0000-0000-000000000001',
   'c1111111-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111',  -- Ava reviewing Dev
   '22222222-2222-2222-2222-222222222221',
   5, 'Dev was a fantastic lunch companion - knew exactly where to take a visitor.'),
  ('f1111111-0000-0000-0000-000000000002',
   'c1111111-0000-0000-0000-000000000001',
   '22222222-2222-2222-2222-222222222221',  -- Dev reviewing Ava
   '11111111-1111-1111-1111-111111111111',
   5, 'Ava is easy company, great chat, would meet again.')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 6. Completed booking #2: Bo (seeker) <-> Eli (companion), dinner
-- ---------------------------------------------------------------------------
insert into public.meal_requests (
  id, seeker_id, companion_id, activity_type, proposed_time,
  venue_name, venue_location, budget_tier, message, status, created_at
) values
  ('b2222222-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111112',  -- Bo
   '22222222-2222-2222-2222-222222222222',  -- Eli
   'dinner',
   now() - interval '4 days',
   'Tony''s Pizza Napoletana', '1570 Stockton St, San Francisco, CA',
   '$$$',
   'First time in North Beach - open to your recommendations.',
   'accepted',
   now() - interval '6 days')
on conflict (id) do nothing;

insert into public.bookings (
  id, request_id, activity_type, venue_name, venue_location,
  scheduled_time, budget_tier, companion_fee, status, created_at
) values
  ('c2222222-0000-0000-0000-000000000001',
   'b2222222-0000-0000-0000-000000000001',
   'dinner',
   'Tony''s Pizza Napoletana', '1570 Stockton St, San Francisco, CA',
   now() - interval '4 days',
   '$$$',
   25.00,
   'completed',
   now() - interval '6 days' + interval '3 hours')
on conflict (id) do nothing;

insert into public.payments (
  id, booking_id, fee_amount, platform_cut, escrow_status,
  stripe_payment_intent_id, stripe_transfer_id
) values
  ('d2222222-0000-0000-0000-000000000001',
   'c2222222-0000-0000-0000-000000000001',
   25.00, 3.75, 'released',
   'pi_test_seed_002', 'tr_test_seed_002')
on conflict (id) do nothing;

insert into public.messages (id, booking_id, sender_id, body, is_system_message, sent_at) values
  ('e2222222-0000-0000-0000-000000000001',
   'c2222222-0000-0000-0000-000000000001',
   null, 'Booking confirmed. Chat is now open.', true,
   now() - interval '6 days' + interval '3 hours'),
  ('e2222222-0000-0000-0000-000000000002',
   'c2222222-0000-0000-0000-000000000001',
   '22222222-2222-2222-2222-222222222222',  -- Eli
   'Tony''s is a classic - we''ll have a great evening.', false,
   now() - interval '5 days')
on conflict (id) do nothing;

insert into public.reviews (id, booking_id, reviewer_id, reviewee_id, rating, comment) values
  ('f2222222-0000-0000-0000-000000000001',
   'c2222222-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111112',  -- Bo reviewing Eli
   '22222222-2222-2222-2222-222222222222',
   5, 'Eli picked a wonderful spot and made the evening memorable.'),
  ('f2222222-0000-0000-0000-000000000002',
   'c2222222-0000-0000-0000-000000000001',
   '22222222-2222-2222-2222-222222222222',  -- Eli reviewing Bo
   '11111111-1111-1111-1111-111111111112',
   4, 'Lovely guest, easy conversation.')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 7. Pending request (Cara -> Dev, coffee) - shows pre-acceptance state
-- ---------------------------------------------------------------------------
insert into public.meal_requests (
  id, seeker_id, companion_id, activity_type, proposed_time,
  venue_name, venue_location, budget_tier, message, status, created_at
) values
  ('b3333333-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111113',  -- Cara
   '22222222-2222-2222-2222-222222222221',  -- Dev
   'coffee',
   now() + interval '2 days',
   'Sightglass Coffee', '270 7th St, San Francisco, CA',
   '$',
   'New to SF, would love a morning coffee chat.',
   'requested',
   now() - interval '2 hours')
on conflict (id) do nothing;

commit;
