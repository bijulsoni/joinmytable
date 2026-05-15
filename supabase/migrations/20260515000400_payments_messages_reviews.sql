-- 20260515000400_payments_messages_reviews.sql
-- Payments (Stripe + escrow), chat messages, and two-way reviews.
-- Owner: Database agent.

-- ---------------------------------------------------------------------------
-- payments
-- ---------------------------------------------------------------------------
-- One row per booking. Tracks the Stripe PaymentIntent + Transfer lifecycle
-- and our escrow state.
--
-- IMPORTANT: card data NEVER lands in this table or anywhere on our servers.
-- Stripe Elements collects the card directly into Stripe (core product
-- rule #10). We only persist Stripe identifiers and our own status.
create table if not exists public.payments (
  id                          uuid primary key default gen_random_uuid(),
  booking_id                  uuid not null unique references public.bookings(id) on delete restrict,
  -- Amount the seeker is charged. This equals the companionship fee
  -- snapshot on the booking. The meal bill is paid in person and is
  -- entirely outside the system (core product rule #2).
  amount_cents                integer not null check (amount_cents > 0),
  -- Platform cut (in cents) deducted at release. Exact percentage is an
  -- open product decision tracked by the Orchestrator.
  platform_fee_cents          integer not null default 0 check (platform_fee_cents >= 0),
  currency                    char(3) not null default 'USD',
  stripe_payment_intent_id    text unique,
  stripe_charge_id            text,
  stripe_transfer_id          text, -- transfer to the companion's connected account
  stripe_refund_id            text,
  payment_status              public.payment_status not null default 'pending',
  escrow_status               public.escrow_status not null default 'pending',
  captured_at                 timestamptz,
  released_at                 timestamptz,
  refunded_at                 timestamptz,
  failure_reason              text check (failure_reason is null or char_length(failure_reason) <= 1000),
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  constraint payments_platform_fee_le_amount check (platform_fee_cents <= amount_cents),
  -- Released funds and refunds are mutually exclusive lifecycle ends.
  constraint payments_release_refund_exclusive
    check (not (released_at is not null and refunded_at is not null))
);

drop trigger if exists set_payments_updated_at on public.payments;
create trigger set_payments_updated_at
before update on public.payments
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- messages
-- ---------------------------------------------------------------------------
-- Chat messages tied to a booking. Chat unlocks only when a booking row
-- exists, i.e. after the originating request was accepted (core product
-- rule #7). Realtime delivery is via Supabase Realtime; the row is the
-- durable record.
--
-- System messages (message_type='system') have sender_user_id null and
-- are written by the server (e.g. "Booking confirmed", "Meal completed").
create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  booking_id      uuid not null references public.bookings(id) on delete cascade,
  sender_user_id  uuid references public.users(id) on delete set null,
  message_type    public.message_type not null default 'user',
  body            text not null check (char_length(body) between 1 and 4000),
  created_at      timestamptz not null default now(),
  -- User messages must have a sender. System messages must not.
  constraint messages_user_has_sender
    check ((message_type = 'user') = (sender_user_id is not null))
);

-- Messages are immutable once written; we do not expose UPDATE. No
-- updated_at column intentionally.

-- ---------------------------------------------------------------------------
-- reviews
-- ---------------------------------------------------------------------------
-- Two-way reviews, allowed only for completed bookings (core product
-- rule #8). Each booking has at most two reviews: one authored by the
-- seeker, one by the companion. The unique constraint enforces that.
create table if not exists public.reviews (
  id                uuid primary key default gen_random_uuid(),
  booking_id        uuid not null references public.bookings(id) on delete cascade,
  author_user_id    uuid not null references public.users(id) on delete restrict,
  subject_user_id   uuid not null references public.users(id) on delete restrict,
  subject_type      public.review_subject_type not null,
  rating            smallint not null check (rating between 1 and 5),
  body              text check (body is null or char_length(body) <= 2000),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint reviews_author_not_subject check (author_user_id <> subject_user_id),
  constraint reviews_one_per_author_per_booking unique (booking_id, author_user_id)
);

drop trigger if exists set_reviews_updated_at on public.reviews;
create trigger set_reviews_updated_at
before update on public.reviews
for each row execute function public.set_updated_at();
