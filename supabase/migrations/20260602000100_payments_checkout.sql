-- 20260602000100_payments_checkout.sql
-- Track the seeker's Stripe Checkout payment on the payments row.
-- Owner: Payments.
--
-- The payments row is created when a booking is confirmed (escrow_status
-- 'held'). With real Stripe Checkout the seeker pays AFTER confirmation,
-- so we record:
--   paid_at                     — set by the webhook when the seeker pays
--   stripe_checkout_session_id  — to correlate the webhook back to the row
-- (stripe_payment_intent_id already exists for the resulting PaymentIntent.)
--
-- paid_at NULL = awaiting the seeker's payment; set = paid (we hold it
-- until the meet completes, then pay the companion — manual in beta).
--
-- Idempotent.

alter table public.payments
  add column if not exists paid_at timestamptz,
  add column if not exists stripe_checkout_session_id text;

comment on column public.payments.paid_at is
  'When the seeker completed Stripe Checkout. NULL = awaiting payment.';
comment on column public.payments.stripe_checkout_session_id is
  'Stripe Checkout Session id, used to correlate the webhook to this row.';
