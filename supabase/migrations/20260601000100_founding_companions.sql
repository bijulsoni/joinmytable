-- 20260601000100_founding_companions.sql
-- Founding Companion program flag.
-- Owner: Trust & Safety + Database.
--
-- The first 100 real companions to be verified are "founding" members:
-- a visible badge + a permanent perk (no platform fee — honored when
-- automated payouts/fees are built; for now the flag just records who
-- qualifies). Applied automatically at admin-approval time while fewer
-- than 100 founding companions exist (see admin verifications action).
--
-- Deliberately NOT backfilled onto the existing seeded/demo verified
-- companions — founding spots are reserved for real recruited companions
-- going forward.
--
-- Idempotent.

alter table public.companion_profiles
  add column if not exists is_founding boolean not null default false;

comment on column public.companion_profiles.is_founding is
  'Founding Companion (first 100 verified). Perk: no platform fee. Set at approval time while founding count < 100.';
