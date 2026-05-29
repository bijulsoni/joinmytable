-- 20260529000100_search_stable_order.sql
-- Make search_companions() return a deterministic order.
-- Owner: Database agent (Wave 1 quick fixes).
--
-- WHY: Two companions with the same rating_avg and within the same
-- distance band (e.g. all 50 seeded companions tied at 4.95) were
-- coming back in a different order on every refresh. On the client
-- that manifested as profiles visibly shuffling — first row would
-- swap out, then the next, etc. Looked like a refresh bug.
--
-- The root cause was the ORDER BY ending at `rating_avg desc nulls last`
-- with no tiebreaker — Postgres is allowed to return tied rows in any
-- order it likes, and it does. Adding `cp.user_id` as the final sort
-- key gives every pair of rows a unique deterministic comparison, so
-- the same query produces the same order every time.
--
-- Distance is rounded to ~1m (the / 1000.0 is meters → km already, so
-- it's effectively distance-as-meters that gets the primary sort).
-- The user_id tiebreaker doesn't affect the visible ranking quality;
-- it just removes the nondeterminism.
--
-- Idempotent: CREATE OR REPLACE.

create or replace function public.search_companions(
  search_lat       double precision default null,
  search_lng       double precision default null,
  radius_km        double precision default 25,
  activity_filter  text             default null,
  min_rating       double precision default null,
  result_limit     integer          default 60
)
returns table (
  user_id      uuid,
  name         text,
  bio          text,
  service_area text,
  photo_urls   text[],
  activities   jsonb,
  rates        jsonb,
  rating_avg   numeric,
  verified_at  timestamptz,
  distance_km  double precision
)
language sql
stable
security invoker
set search_path = public
as $$
  with seeker_point as (
    select case
      when search_lat is null or search_lng is null then null
      else st_setsrid(st_makepoint(search_lng, search_lat), 4326)::geography
    end as p
  )
  select
    cp.user_id,
    u.name,
    cp.bio,
    cp.service_area,
    cp.photo_urls,
    cp.activities,
    cp.rates,
    cp.rating_avg,
    cp.verified_at,
    case
      when sp.p is null then null
      else st_distance(cp.location, sp.p) / 1000.0
    end as distance_km
  from public.companion_profiles cp
  inner join public.users u on u.id = cp.user_id
  cross join seeker_point sp
  where cp.verified_at is not null
    and u.is_companion = true
    and (
      sp.p is null
      or st_dwithin(cp.location, sp.p, radius_km * 1000)
    )
    and (
      activity_filter is null
      or (cp.activities ->> activity_filter)::boolean is true
    )
    and (min_rating is null or cp.rating_avg >= min_rating)
  order by
    case when sp.p is not null then st_distance(cp.location, sp.p) else null end nulls last,
    cp.rating_avg desc nulls last,
    cp.user_id  -- deterministic tiebreaker — fixes shuffle on refresh
  limit result_limit;
$$;

revoke all on function public.search_companions(double precision, double precision, double precision, text, double precision, integer) from public;
grant execute on function public.search_companions(double precision, double precision, double precision, text, double precision, integer) to authenticated;
grant execute on function public.search_companions(double precision, double precision, double precision, text, double precision, integer) to anon;
