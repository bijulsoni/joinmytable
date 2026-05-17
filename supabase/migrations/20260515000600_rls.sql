-- 20260515000600_rls.sql
-- Row Level Security policies.
-- Owner: Database agent.
--
-- Policy summary (matches agents/agent-database.md section 4):
--   - users:              read/update only own row.
--   - companion_profiles: verified rows publicly readable; owner-only
--                         insert/update/delete.
--   - availability:       verified-companion availability publicly readable;
--                         owner-only insert/update/delete.
--   - meal_requests:      seeker + companion can read; seeker creates;
--                         only the companion can update status.
--   - bookings:           only participants (seeker via the originating
--                         request, companion via the originating request)
--                         can read/update; no client inserts.
--   - payments:           only the booking's seeker and companion can read;
--                         no client inserts (service role only).
--   - messages:           only the booking's participants can read/insert.
--   - reviews:            anyone can read; only the reviewer (a participant
--                         of a completed booking) can insert; no updates.
--
-- The Core API enforces business-rule transitions (e.g. only the seeker
-- can cancel a request that is still 'requested'). RLS is the last-line
-- authorization fence.

-- ---------------------------------------------------------------------------
-- Helper: is the caller a participant of the given booking?
-- ---------------------------------------------------------------------------
-- security definer so the function can resolve the booking <-> request
-- chain even when the caller's RLS would otherwise hide intermediate
-- rows. Used by payments, messages, and bookings policies.
create or replace function public.is_booking_participant(p_booking_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.bookings b
    join public.meal_requests r on r.id = b.request_id
    where b.id = p_booking_id
      and (r.seeker_id = auth.uid() or r.companion_id = auth.uid())
  );
$$;

revoke all on function public.is_booking_participant(uuid) from public;
grant execute on function public.is_booking_participant(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
alter table public.users enable row level security;

drop policy if exists users_select_self on public.users;
create policy users_select_self
  on public.users for select
  using (id = auth.uid());

-- Verified companions need their users row visible so discovery can show
-- name + email-derived identicons. Limited to rows backed by a verified
-- companion profile.
drop policy if exists users_select_verified_companion on public.users;
create policy users_select_verified_companion
  on public.users for select
  using (
    exists (
      select 1 from public.companion_profiles cp
      where cp.user_id = public.users.id
        and cp.verified_at is not null
    )
  );

drop policy if exists users_insert_self on public.users;
create policy users_insert_self
  on public.users for insert
  with check (id = auth.uid());

drop policy if exists users_update_self on public.users;
create policy users_update_self
  on public.users for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- No DELETE policy: account removal is service-role.

-- ---------------------------------------------------------------------------
-- companion_profiles
-- ---------------------------------------------------------------------------
alter table public.companion_profiles enable row level security;

-- Owner can always see their own profile (verified or not).
drop policy if exists companion_profiles_select_self on public.companion_profiles;
create policy companion_profiles_select_self
  on public.companion_profiles for select
  using (user_id = auth.uid());

-- Public discoverability gate: only verified profiles
-- (verified_at IS NOT NULL) are visible to anyone other than the owner.
-- Core product rule #10.
drop policy if exists companion_profiles_select_verified on public.companion_profiles;
create policy companion_profiles_select_verified
  on public.companion_profiles for select
  using (verified_at is not null);

drop policy if exists companion_profiles_insert_self on public.companion_profiles;
create policy companion_profiles_insert_self
  on public.companion_profiles for insert
  with check (user_id = auth.uid());

drop policy if exists companion_profiles_update_self on public.companion_profiles;
create policy companion_profiles_update_self
  on public.companion_profiles for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists companion_profiles_delete_self on public.companion_profiles;
create policy companion_profiles_delete_self
  on public.companion_profiles for delete
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- availability
-- ---------------------------------------------------------------------------
alter table public.availability enable row level security;

drop policy if exists availability_select_self on public.availability;
create policy availability_select_self
  on public.availability for select
  using (
    exists (
      select 1 from public.companion_profiles cp
      where cp.id = public.availability.companion_profile_id
        and cp.user_id = auth.uid()
    )
  );

-- Public availability for verified companions only.
drop policy if exists availability_select_public_verified on public.availability;
create policy availability_select_public_verified
  on public.availability for select
  using (
    exists (
      select 1 from public.companion_profiles cp
      where cp.id = public.availability.companion_profile_id
        and cp.verified_at is not null
    )
  );

drop policy if exists availability_insert_self on public.availability;
create policy availability_insert_self
  on public.availability for insert
  with check (
    exists (
      select 1 from public.companion_profiles cp
      where cp.id = public.availability.companion_profile_id
        and cp.user_id = auth.uid()
    )
  );

drop policy if exists availability_update_self on public.availability;
create policy availability_update_self
  on public.availability for update
  using (
    exists (
      select 1 from public.companion_profiles cp
      where cp.id = public.availability.companion_profile_id
        and cp.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.companion_profiles cp
      where cp.id = public.availability.companion_profile_id
        and cp.user_id = auth.uid()
    )
  );

drop policy if exists availability_delete_self on public.availability;
create policy availability_delete_self
  on public.availability for delete
  using (
    exists (
      select 1 from public.companion_profiles cp
      where cp.id = public.availability.companion_profile_id
        and cp.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- meal_requests
-- ---------------------------------------------------------------------------
alter table public.meal_requests enable row level security;

drop policy if exists meal_requests_select_participant on public.meal_requests;
create policy meal_requests_select_participant
  on public.meal_requests for select
  using (seeker_id = auth.uid() or companion_id = auth.uid());

-- Only the seeker can create a request. The Core API additionally checks
-- the target companion is verified before allowing the insert.
drop policy if exists meal_requests_insert_seeker on public.meal_requests;
create policy meal_requests_insert_seeker
  on public.meal_requests for insert
  with check (seeker_id = auth.uid());

-- Only the companion can update (to set status accepted/declined).
-- Seeker-initiated cancellation lives on bookings, not here.
drop policy if exists meal_requests_update_companion on public.meal_requests;
create policy meal_requests_update_companion
  on public.meal_requests for update
  using (companion_id = auth.uid())
  with check (companion_id = auth.uid());

-- ---------------------------------------------------------------------------
-- bookings
-- ---------------------------------------------------------------------------
alter table public.bookings enable row level security;

drop policy if exists bookings_select_participant on public.bookings;
create policy bookings_select_participant
  on public.bookings for select
  using (public.is_booking_participant(id));

-- INSERT is service-role only: a booking is created server-side by the
-- Core API when a request is accepted.

drop policy if exists bookings_update_participant on public.bookings;
create policy bookings_update_participant
  on public.bookings for update
  using (public.is_booking_participant(id))
  with check (public.is_booking_participant(id));

-- ---------------------------------------------------------------------------
-- payments
-- ---------------------------------------------------------------------------
alter table public.payments enable row level security;

-- Participants of the underlying booking may read their payment record
-- ("fee in escrow" / "fee released" UI). No client writes - the Payments
-- agent's server code (service role) owns this table.
drop policy if exists payments_select_participant on public.payments;
create policy payments_select_participant
  on public.payments for select
  using (public.is_booking_participant(booking_id));

-- ---------------------------------------------------------------------------
-- messages
-- ---------------------------------------------------------------------------
alter table public.messages enable row level security;

drop policy if exists messages_select_participant on public.messages;
create policy messages_select_participant
  on public.messages for select
  using (public.is_booking_participant(booking_id));

-- Authenticated users may insert their own (non-system) messages into
-- bookings they participate in. System messages (is_system_message =
-- true, sender_id null) are service-role only and rejected here.
drop policy if exists messages_insert_participant on public.messages;
create policy messages_insert_participant
  on public.messages for insert
  with check (
    is_system_message is not true
    and sender_id = auth.uid()
    and public.is_booking_participant(booking_id)
  );

-- Messages are immutable; no UPDATE/DELETE policies.

-- ---------------------------------------------------------------------------
-- reviews
-- ---------------------------------------------------------------------------
alter table public.reviews enable row level security;

-- Reviews are public (per CLAUDE.md task spec): they render on companion
-- profile pages.
drop policy if exists reviews_select_public on public.reviews;
create policy reviews_select_public
  on public.reviews for select
  using (true);

-- A review may only be inserted by the reviewer themselves, against the
-- counterparty of a COMPLETED booking they participated in
-- (core product rule #9).
drop policy if exists reviews_insert_completed_participant on public.reviews;
create policy reviews_insert_completed_participant
  on public.reviews for insert
  with check (
    reviewer_id = auth.uid()
    and exists (
      select 1
      from public.bookings b
      join public.meal_requests r on r.id = b.request_id
      where b.id = reviews.booking_id
        and b.status = 'completed'
        and (
          (r.seeker_id = auth.uid()    and reviews.reviewee_id = r.companion_id)
          or
          (r.companion_id = auth.uid() and reviews.reviewee_id = r.seeker_id)
        )
    )
  );

-- No UPDATE / DELETE policies: reviews are immutable per the task spec.
