-- 20260515000100_init.sql
-- JoinMyTable - Phase 0 schema bootstrap.
-- Owner: Database agent.
--
-- This migration installs the extensions, enum types, and helper utilities
-- that every later migration depends on. It is idempotent so the same file
-- applies cleanly to development, staging, and production projects.

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
-- pgcrypto: gen_random_uuid() for primary keys.
-- postgis : geography type + GiST indexes for companion service-area search.
-- citext  : case-insensitive email column.
create extension if not exists "pgcrypto";
create extension if not exists "postgis";
create extension if not exists "citext";

-- ---------------------------------------------------------------------------
-- Enum types
-- ---------------------------------------------------------------------------
-- Every status field on the data model is an enum. Free-form strings are
-- explicitly forbidden by the project conventions in CLAUDE.md.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'meal_type') then
    create type public.meal_type as enum ('lunch', 'dinner');
  end if;

  if not exists (select 1 from pg_type where typname = 'verification_status') then
    create type public.verification_status as enum (
      'unverified',
      'pending',
      'verified',
      'rejected'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'request_status') then
    -- Lifecycle of a meal_request row.
    -- requested -> accepted | declined | cancelled | expired
    -- 'accepted' is terminal on the request; the booking row carries the
    -- post-acceptance lifecycle.
    create type public.request_status as enum (
      'requested',
      'accepted',
      'declined',
      'cancelled',
      'expired'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'booking_status') then
    -- accepted   - booking created from an accepted request; details pending
    -- confirmed  - restaurant/time set, fee captured into escrow
    -- completed  - meal happened; escrow released
    -- cancelled  - off-ramp; triggers refund logic
    create type public.booking_status as enum (
      'accepted',
      'confirmed',
      'completed',
      'cancelled'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'budget_tier') then
    -- Seeker-set expected meal cost band. Exact price ranges live in app
    -- config, not the database, so they can move without a migration.
    create type public.budget_tier as enum ('low', 'medium', 'high');
  end if;

  if not exists (select 1 from pg_type where typname = 'payment_status') then
    create type public.payment_status as enum (
      'pending',
      'requires_action',
      'authorized',
      'captured',
      'released',
      'refunded',
      'failed'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'escrow_status') then
    -- pending  - no funds taken yet
    -- held     - funds captured, sitting on the platform account
    -- released - transferred to the companion's connected account
    -- refunded - returned to the seeker
    create type public.escrow_status as enum (
      'pending',
      'held',
      'released',
      'refunded'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'message_type') then
    -- 'user'   - chat message authored by a booking participant
    -- 'system' - automated entry written by the platform (e.g. "booking confirmed")
    create type public.message_type as enum ('user', 'system');
  end if;

  if not exists (select 1 from pg_type where typname = 'review_subject_type') then
    -- Direction of a two-way review.
    create type public.review_subject_type as enum ('companion', 'seeker');
  end if;

  if not exists (select 1 from pg_type where typname = 'cancellation_party') then
    create type public.cancellation_party as enum ('seeker', 'companion', 'system');
  end if;
end$$;

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
-- Every mutable table uses this; it keeps updated_at honest without relying
-- on the application layer to set it.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
