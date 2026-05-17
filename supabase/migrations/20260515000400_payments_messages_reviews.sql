-- 20260515000400_payments_messages_reviews.sql
-- payments, messages, reviews.
-- Owner: Database agent.
--
-- Schema follows CLAUDE.md "Database schema" verbatim.
--
-- payments holds Stripe identifiers + escrow status. Card data NEVER
-- lands in this table (core product rule #11) - only Stripe-issued ids.
--
-- messages: in-app chat tied to a booking. Chat unlocks only after the
-- originating request was accepted, i.e. a bookings row exists
-- (core product rule #8). System messages have sender_id null and
-- is_system_message = true.
--
-- reviews: two-way, allowed only after a booking transitions to
-- 'completed' (core product rule #9, enforced in RLS).

-- ---------------------------------------------------------------------------
-- payments
-- ---------------------------------------------------------------------------
create table if not exists public.payments (
  id                        uuid primary key default gen_random_uuid(),
  booking_id                uuid references public.bookings(id),
  fee_amount                decimal(10,2) not null,
  platform_cut              decimal(10,2) not null,
  escrow_status             text default 'held'
    check (escrow_status in ('held','released','refunded')),
  stripe_payment_intent_id  text,
  stripe_transfer_id        text,
  created_at                timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- messages
-- ---------------------------------------------------------------------------
-- sender_id is nullable so the platform can author system entries (e.g.
-- "Booking confirmed"). RLS guarantees only booking participants may
-- INSERT a non-system message (see 000600).
create table if not exists public.messages (
  id                uuid primary key default gen_random_uuid(),
  booking_id        uuid references public.bookings(id),
  sender_id         uuid references public.users(id),
  body              text not null,
  is_system_message boolean default false,
  sent_at           timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- reviews
-- ---------------------------------------------------------------------------
-- Two-way: one row per direction (reviewer -> reviewee) per booking.
-- The Core API enforces the "two reviews max per booking" cap.
create table if not exists public.reviews (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid references public.bookings(id),
  reviewer_id  uuid references public.users(id),
  reviewee_id  uuid references public.users(id),
  rating       int check (rating between 1 and 5),
  comment      text,
  created_at   timestamptz default now()
);
