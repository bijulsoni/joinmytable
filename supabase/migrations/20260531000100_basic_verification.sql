-- 20260531000100_basic_verification.sql
-- Two-tier companion verification: selfie-only "basic" vs full ID.
-- Owner: Trust & Safety + Database.
--
-- WHY: During cold-start, requiring a government ID + selfie up front
-- stalls a lot of sign-ups (people hesitate to upload an ID), leaving
-- Explore sparse. We introduce a lighter "basic" tier:
--
--   BASIC  — selfie reviewed by an admin. Makes the companion
--            DISCOVERABLE in Explore (tagged "Basic"). companion_profiles
--            .verified_at is set, id_verified_at stays NULL.
--   FULL   — government ID + selfie reviewed. companion_profiles
--            .id_verified_at is set. Earns the "Verified" badge and is
--            REQUIRED before the companion can accept a request (i.e.
--            before any real in-person meet is confirmed).
--
-- Safety line preserved: discovery is relaxed to selfie-reviewed people,
-- but a confirmed meet still requires full ID (enforced in the request
-- accept path). See CLAUDE.md core rule #10 (now tiered).
--
-- verified_at keeps its existing meaning ("discoverable") so the
-- discovery RLS + search function need no change. We ADD id_verified_at
-- for the full tier.
--
-- Backfill: every currently-verified companion was verified under the
-- old ID-required flow, so they are fully verified — set id_verified_at
-- = verified_at for existing rows.
--
-- Idempotent.

alter table public.companion_profiles
  add column if not exists id_verified_at timestamptz;

-- Existing verified companions were ID-verified under the old flow.
update public.companion_profiles
  set id_verified_at = verified_at
  where verified_at is not null and id_verified_at is null;

comment on column public.companion_profiles.id_verified_at is
  'Set when government ID + selfie are reviewed (full tier). NULL = basic/selfie-only. Required to accept a request (confirm a meet). verified_at alone = discoverable (basic).';
