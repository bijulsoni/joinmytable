-- 20260516000300_reviews_unique.sql
-- Phase 3 — enforce "one review per reviewer per booking" in the DB.
-- Owner: Core API agent (Phase 3 build).
--
-- The Core API layer rejects duplicates via a friendly error code, but
-- the constraint must live in the DB to remain race-safe. Idempotent.

create unique index if not exists reviews_booking_reviewer_unique
  on public.reviews (booking_id, reviewer_id);
