-- 20260529000300_search_soft_match.sql
-- Soft preference ranking in search_companions().
-- Owner: Database agent (Wave 3 — preferences + soft ranking).
--
-- WHY: We want people the seeker is more likely to want to meet ranked
-- higher — WITHOUT hiding anyone. This is a SOFT signal, deliberately,
-- because the beta companion pool is small and a hard filter would
-- routinely empty the feed (cold-start problem). Non-matches still show;
-- they just sort below matches.
--
-- The match is MUTUAL and preference-aware:
--   caller_wants_them  = caller has no stated preference (NULL/empty)
--                        OR their gender is unknown (NULL)
--                        OR their gender is in caller.interested_in
--   they_want_caller   = they have no stated preference
--                        OR caller's gender is unknown
--                        OR caller's gender is in their interested_in
--   match_score = 1 when both hold, else 0
--
-- Unknown/unset preferences always PASS (score toward 1) — never a
-- penalty. So today, with prefs mostly unset, everyone scores 1 and the
-- order is identical to before. As users fill in preferences the feed
-- gently reorders. No one ever disappears.
--
-- Caller preferences are read from public.users via auth.uid(). The
-- function stays SECURITY INVOKER and its SIGNATURE IS UNCHANGED, so the
-- /api/search/companions route needs no changes. For anon callers
-- (auth.uid() IS NULL) the caller-prefs row is absent → all unset →
-- everyone scores 1 → unchanged behavior.
--
-- Ordering: match_score DESC, then the existing distance / rating /
-- user_id keys. The user_id tiebreaker from 20260529000100 is preserved
-- so results stay deterministic (no shuffle-on-refresh).
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
  ),
  -- Caller's own gender + who they're interested in. Empty row for anon.
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
    -- Soft preference boost: mutual match sorts first (1 before 0).
    -- Unknown/unset preferences on either side count as a match.
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
    cp.user_id  -- deterministic tiebreaker (preserved from 20260529000100)
  limit result_limit;
$$;

revoke all on function public.search_companions(double precision, double precision, double precision, text, double precision, integer) from public;
grant execute on function public.search_companions(double precision, double precision, double precision, text, double precision, integer) to authenticated;
grant execute on function public.search_companions(double precision, double precision, double precision, text, double precision, integer) to anon;
