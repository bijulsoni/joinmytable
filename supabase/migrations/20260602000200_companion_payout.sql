-- 20260602000200_companion_payout.sql
-- Where to send a companion their payout (manual Venmo/Zelle/PayPal in beta).
-- Owner: Payments.
--
-- Collected at the verification step (companion is already there). Stored
-- on companion_profiles. ADMIN-ONLY in practice: it's never included in
-- any public/seeker-facing select (profiles API, search), and only the
-- service-role admin tooling reads it. The owner can write their own via
-- the existing companion_profiles owner-update RLS policy.
--
-- Idempotent.

alter table public.companion_profiles
  add column if not exists payout_method text
    check (payout_method is null or payout_method in ('venmo', 'zelle', 'paypal')),
  add column if not exists payout_handle text;

comment on column public.companion_profiles.payout_method is
  'How the companion is paid out: venmo | zelle | paypal. Admin-only.';
comment on column public.companion_profiles.payout_handle is
  'Companion''s payout handle (@user / phone / email). Admin-only — never exposed to seekers.';
