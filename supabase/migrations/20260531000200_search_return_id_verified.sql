-- 20260531000200_search_return_id_verified.sql
-- Surface the verification TIER through search_companions().
-- Owner: Database (basic-verification tier).
--
-- Adds id_verified_at to the function's return so the discover feed can
-- badge a companion as "Verified" (full ID) vs "Basic" (selfie only).
-- Everything else — the soft preference ranking + deterministic order
-- from 20260529000300 — is preserved verbatim.
--
-- Idempotent: CREATE OR REPLACE. The signature is unchanged, but the
-- RETURNS table gains a column, so we DROP first (Postgres won't replace
-- a function whose OUT columns changed).

drop function if exists public.search_companions(
  double precision, double precision, double precision, text, double precision, integer
);

create function public.search_companions(
  search_lat       double precision default null,
  search_lng       double precision default null,
  radius_km        double precision default 25,
  activity_filter  text             default null,
  min_rating       double precision default null,
  result_limit     integer          default 60
)
returns table (
  user_id        uuid,
  name           text,
  bio            text,
  service_area   text,
  photo_urls     text[],
  activities     jsonb,
  rates          jsonb,
  rating_avg     numeric,
  verified_at    timestamptz,
  id_verified_at timestamptz,
  distance_km    double precision
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
  ),
  caller as (
    select cu.gender as gender, cu.interested_in as interested_in
    from public.users cu
    where cu.id = auth.uid()
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
    cp.id_verified_at,
    case
      when sp.p is null then null
      else st_distance(cp.location, sp.p) / 1000.0
    end as distance_km
  from public.companion_profiles cp
  inner join public.users u on u.id = cp.user_id
  cross join seeker_point sp
  left join caller c on true
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
    (
      case
        when (
          c.interested_in is null
          or cardinality(c.interested_in) = 0
          or u.gender is null
          or u.gender = any (c.interested_in)
        )
        and (
          u.interested_in is null
          or cardinality(u.interested_in) = 0
          or c.gender is null
          or c.gender = any (u.interested_in)
        )
        then 1
        else 0
      end
    ) desc,
    case when sp.p is not null then st_distance(cp.location, sp.p) else null end nulls last,
    cp.rating_avg desc nulls last,
    cp.user_id
  limit result_limit;
$$;

revoke all on function public.search_companions(double precision, double precision, double precision, text, double precision, integer) from public;
grant execute on function public.search_companions(double precision, double precision, double precision, text, double precision, integer) to authenticated;
grant execute on function public.search_companions(double precision, double precision, double precision, text, double precision, integer) to anon;
