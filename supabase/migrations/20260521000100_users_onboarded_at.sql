-- 20260521000100_users_onboarded_at.sql
-- Track whether a user has completed the post-signup onboarding flow.
-- Owner: Database agent (Phase 5 beta-prep).
--
-- The new /welcome page collects photos, bio, service area, and (optional)
-- paid-companion settings up front, instead of bouncing the user to
-- /profile after signup. This column tracks whether they've finished it.
--
--   NULL          -> onboarding not complete; route to /welcome on login
--   <timestamptz> -> onboarding complete; route to /discover on login
--
-- The /welcome page sets this to now() when the user hits Continue
-- (regardless of which fields they filled — Continue means "I'm done").
-- It's a one-way flag: there's no "re-onboard" flow.
--
-- Backfill: any user that exists today already saw the old post-signup
-- world. Treat them as onboarded so they don't get re-routed.

alter table public.users
  add column if not exists onboarded_at timestamptz;

-- Backfill: existing users skip the new welcome flow.
update public.users
  set onboarded_at = coalesce(onboarded_at, created_at)
  where onboarded_at is null;
