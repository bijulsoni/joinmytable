-- 20260516000200_reviews_trigger.sql
-- Phase 3 — keep companion_profiles.rating_avg in sync with reviews.
-- Owner: Core API agent (Phase 3 build).
--
-- Recomputes the average rating for the affected reviewee on every
-- insert/update/delete of a reviews row. Idempotent.

create or replace function public.recompute_companion_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.companion_profiles
  set rating_avg = coalesce(
    (
      select round(avg(r.rating)::numeric, 2)
      from public.reviews r
      where r.reviewee_id = companion_profiles.user_id
    ),
    0
  )
  where user_id in (
    coalesce(new.reviewee_id, null),
    coalesce(old.reviewee_id, null)
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists reviews_recompute_rating on public.reviews;
create trigger reviews_recompute_rating
after insert or update or delete on public.reviews
for each row execute function public.recompute_companion_rating();
