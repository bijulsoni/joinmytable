-- scripts/db/verify.sql
-- Post-migration schema verification. Run with:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/db/verify.sql
--
-- Every assertion uses RAISE EXCEPTION so a missing piece fails the script
-- non-zero, suitable as a CI smoke gate. Idempotent (read-only).

do $$
declare
  missing_ext text;
  missing_enum text;
  missing_table text;
  missing_index text;
  missing_policy text;
  missing_rls text;
  missing_fn text;
begin
  -- Extensions ------------------------------------------------------------
  select e into missing_ext
  from unnest(array['pgcrypto', 'postgis', 'citext']) e
  where not exists (select 1 from pg_extension where extname = e)
  limit 1;
  if missing_ext is not null then
    raise exception 'verify: extension % is not installed', missing_ext;
  end if;

  -- Enum types ------------------------------------------------------------
  select t into missing_enum
  from unnest(array[
    'meal_type','verification_status','request_status','booking_status',
    'budget_tier','payment_status','escrow_status','message_type',
    'review_subject_type','cancellation_party'
  ]) t
  where not exists (select 1 from pg_type where typname = t)
  limit 1;
  if missing_enum is not null then
    raise exception 'verify: enum type % is missing', missing_enum;
  end if;

  -- Tables ----------------------------------------------------------------
  select t into missing_table
  from unnest(array[
    'users','companion_profiles','availability','meal_requests',
    'bookings','payments','messages','reviews'
  ]) t
  where not exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = t
  )
  limit 1;
  if missing_table is not null then
    raise exception 'verify: public table % is missing', missing_table;
  end if;

  -- RLS enabled on every public table -------------------------------------
  select c.relname into missing_rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and c.relname in (
      'users','companion_profiles','availability','meal_requests',
      'bookings','payments','messages','reviews'
    )
    and c.relrowsecurity = false
  limit 1;
  if missing_rls is not null then
    raise exception 'verify: row-level security is NOT enabled on public.%', missing_rls;
  end if;

  -- GiST geo indexes ------------------------------------------------------
  select i into missing_index
  from unnest(array[
    'companion_profiles_service_area_gix',
    'bookings_restaurant_location_gix',
    'meal_requests_proposed_location_gix'
  ]) i
  where not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = i
  )
  limit 1;
  if missing_index is not null then
    raise exception 'verify: geo index % is missing', missing_index;
  end if;

  -- Verify the geo indexes are actually GiST -------------------------------
  if not exists (
    select 1
    from pg_index x
    join pg_class i on i.oid = x.indexrelid
    join pg_am am on am.oid = i.relam
    join pg_class t on t.oid = x.indrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'companion_profiles'
      and i.relname = 'companion_profiles_service_area_gix'
      and am.amname = 'gist'
  ) then
    raise exception 'verify: companion_profiles_service_area_gix exists but is not a GiST index';
  end if;

  -- Helper function -------------------------------------------------------
  select p.proname into missing_fn
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'is_booking_participant';
  if missing_fn is null then
    raise exception 'verify: helper function public.is_booking_participant(uuid) is missing';
  end if;

  -- Spot-check critical RLS policies --------------------------------------
  select expected into missing_policy
  from (values
    ('users', 'users_select_self'),
    ('users', 'users_select_verified_companion'),
    ('companion_profiles', 'companion_profiles_select_verified'),
    ('availability', 'availability_select_public_verified'),
    ('meal_requests', 'meal_requests_select_participant'),
    ('bookings', 'bookings_select_participant'),
    ('payments', 'payments_select_participant'),
    ('messages', 'messages_select_participant'),
    ('messages', 'messages_insert_participant'),
    ('reviews', 'reviews_insert_completed_participant')
  ) as v(tbl, expected)
  where not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = v.tbl and policyname = v.expected
  )
  limit 1;
  if missing_policy is not null then
    raise exception 'verify: expected RLS policy % is missing', missing_policy;
  end if;

  raise notice 'verify: ok - extensions, enums, tables, RLS, GiST indexes, helpers, and policies are all present.';
end$$;
