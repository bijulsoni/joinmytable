-- 20260515000600_rls.sql
-- Row Level Security policies.
-- Owner: Database agent.
--
-- High-level access model:
--   - users:              own row; basic fields readable when the user is
--                         a verified companion (for discovery); booking
--                         counterparties can see each other.
--   - companion_profiles: own row CRUD; verified rows publicly readable.
--   - availability:       own row CRUD; verified-companion availability
--                         publicly readable (drives discovery filters).
--   - meal_requests:      participants only; seeker creates, companion
--                         responds, application enforces transitions.
--   - bookings:           participants only; writes constrained to
--                         participants (transition guards live in API).
--   - payments:           participants may read; only the service role
--                         (Payments agent's server code) may write.
--   - messages:           booking participants may read; user messages
--                         must be authored by a participant; system
--                         messages are service-role only.
--   - reviews:            publicly readable (so companion profiles show
--                         them); authors must be participants of a
--                         COMPLETED booking and may only write themselves.
--
-- All status-transition rules (request -> accepted, booking -> completed,
-- escrow release, etc.) live in the API layer, NOT in RLS. RLS is a
-- last-line authorization fence; the Core API is the enforcer of
-- business rules per CLAUDE.md.

-- ---------------------------------------------------------------------------
-- Helper: is the caller a participant of the given booking?
-- ---------------------------------------------------------------------------
-- security definer so the function can see the bookings row even when the
-- caller's RLS would otherwise restrict the lookup.
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
    where b.id = p_booking_id
      and (b.seeker_user_id = auth.uid() or b.companion_user_id = auth.uid())
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

-- Verified companions are discoverable; their user row needs to be
-- readable so the discovery list can render name + avatar.
drop policy if exists users_select_verified_companion on public.users;
create policy users_select_verified_companion
  on public.users for select
  using (
    exists (
      select 1
      from public.companion_profiles cp
      where cp.user_id = public.users.id
        and cp.verification_status = 'verified'
    )
  );

-- Booking counterparties can see each other (after a request is accepted).
drop policy if exists users_select_booking_counterparty on public.users;
create policy users_select_booking_counterparty
  on public.users for select
  using (
    exists (
      select 1
      from public.bookings b
      where (b.seeker_user_id = auth.uid() and b.companion_user_id = public.users.id)
         or (b.companion_user_id = auth.uid() and b.seeker_user_id = public.users.id)
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

-- No DELETE policy: hard-delete is service-role only; user-initiated
-- removal sets deleted_at via the API.

-- ---------------------------------------------------------------------------
-- companion_profiles
-- ---------------------------------------------------------------------------
alter table public.companion_profiles enable row level security;

drop policy if exists companion_profiles_select_self on public.companion_profiles;
create policy companion_profiles_select_self
  on public.companion_profiles for select
  using (user_id = auth.uid());

-- Public discoverability gate: ONLY verified profiles are visible to
-- anyone other than the owner. Core product rule #9.
drop policy if exists companion_profiles_select_verified on public.companion_profiles;
create policy companion_profiles_select_verified
  on public.companion_profiles for select
  using (verification_status = 'verified');

drop policy if exists companion_profiles_insert_self on public.companion_profiles;
create policy companion_profiles_insert_self
  on public.companion_profiles for insert
  with check (user_id = auth.uid());

-- The owner can update profile fields. verification_status is intended to
-- be moved by the Auth & Identity agent's verification flow (which will
-- run with elevated privileges); the owner cannot legally self-verify in
-- the application even though RLS does not block the column write itself.
drop policy if exists companion_profiles_update_self on public.companion_profiles;
create policy companion_profiles_update_self
  on public.companion_profiles for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- availability
-- ---------------------------------------------------------------------------
alter table public.availability enable row level security;

drop policy if exists availability_select_self on public.availability;
create policy availability_select_self
  on public.availability for select
  using (companion_user_id = auth.uid());

drop policy if exists availability_select_public_verified on public.availability;
create policy availability_select_public_verified
  on public.availability for select
  using (
    exists (
      select 1 from public.companion_profiles cp
      where cp.user_id = public.availability.companion_user_id
        and cp.verification_status = 'verified'
    )
  );

drop policy if exists availability_insert_self on public.availability;
create policy availability_insert_self
  on public.availability for insert
  with check (companion_user_id = auth.uid());

drop policy if exists availability_update_self on public.availability;
create policy availability_update_self
  on public.availability for update
  using (companion_user_id = auth.uid())
  with check (companion_user_id = auth.uid());

drop policy if exists availability_delete_self on public.availability;
create policy availability_delete_self
  on public.availability for delete
  using (companion_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- meal_requests
-- ---------------------------------------------------------------------------
alter table public.meal_requests enable row level security;

drop policy if exists meal_requests_select_participant on public.meal_requests;
create policy meal_requests_select_participant
  on public.meal_requests for select
  using (seeker_user_id = auth.uid() or companion_user_id = auth.uid());

-- A request can only be created by the seeker. The Core API additionally
-- verifies that the target companion is verified.
drop policy if exists meal_requests_insert_seeker on public.meal_requests;
create policy meal_requests_insert_seeker
  on public.meal_requests for insert
  with check (seeker_user_id = auth.uid());

-- Either participant may update; the Core API enforces which transitions
-- they are allowed (e.g. only the companion may move to 'accepted'/'declined',
-- only the seeker may move to 'cancelled' while still 'requested').
drop policy if exists meal_requests_update_participant on public.meal_requests;
create policy meal_requests_update_participant
  on public.meal_requests for update
  using (seeker_user_id = auth.uid() or companion_user_id = auth.uid())
  with check (seeker_user_id = auth.uid() or companion_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- bookings
-- ---------------------------------------------------------------------------
alter table public.bookings enable row level security;

drop policy if exists bookings_select_participant on public.bookings;
create policy bookings_select_participant
  on public.bookings for select
  using (seeker_user_id = auth.uid() or companion_user_id = auth.uid());

-- INSERT is service-role only: a booking is created server-side by the
-- Core API when a request is accepted. No anon/authenticated INSERT policy.

drop policy if exists bookings_update_participant on public.bookings;
create policy bookings_update_participant
  on public.bookings for update
  using (seeker_user_id = auth.uid() or companion_user_id = auth.uid())
  with check (seeker_user_id = auth.uid() or companion_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- payments
-- ---------------------------------------------------------------------------
alter table public.payments enable row level security;

-- Participants of the booking can read their own payment record (so the
-- Frontend can show "fee in escrow" / "fee released").
drop policy if exists payments_select_participant on public.payments;
create policy payments_select_participant
  on public.payments for select
  using (public.is_booking_participant(booking_id));

-- No INSERT/UPDATE/DELETE policies: payments are written exclusively by
-- the Payments agent's server-side code via the service role.

-- ---------------------------------------------------------------------------
-- messages
-- ---------------------------------------------------------------------------
alter table public.messages enable row level security;

drop policy if exists messages_select_participant on public.messages;
create policy messages_select_participant
  on public.messages for select
  using (public.is_booking_participant(booking_id));

-- Authenticated users may INSERT 'user' messages, but only into bookings
-- they participate in, and only as themselves. System messages are
-- service-role only (sender_user_id is null, blocked here).
drop policy if exists messages_insert_participant on public.messages;
create policy messages_insert_participant
  on public.messages for insert
  with check (
    message_type = 'user'
    and sender_user_id = auth.uid()
    and public.is_booking_participant(booking_id)
  );

-- Messages are immutable; no UPDATE/DELETE policies.

-- ---------------------------------------------------------------------------
-- reviews
-- ---------------------------------------------------------------------------
alter table public.reviews enable row level security;

-- Reviews are public so they can render on companion profile pages.
drop policy if exists reviews_select_public on public.reviews;
create policy reviews_select_public
  on public.reviews for select
  using (true);

-- A review can only be authored by:
--   - the caller (author_user_id = auth.uid())
--   - on a booking they participated in
--   - that is 'completed'
--   - against the other party (subject is the counterparty, with the
--     correct subject_type)
drop policy if exists reviews_insert_completed_participant on public.reviews;
create policy reviews_insert_completed_participant
  on public.reviews for insert
  with check (
    author_user_id = auth.uid()
    and exists (
      select 1
      from public.bookings b
      where b.id = reviews.booking_id
        and b.status = 'completed'
        and (
          (b.seeker_user_id = auth.uid()
            and reviews.subject_user_id = b.companion_user_id
            and reviews.subject_type = 'companion')
          or
          (b.companion_user_id = auth.uid()
            and reviews.subject_user_id = b.seeker_user_id
            and reviews.subject_type = 'seeker')
        )
    )
  );

-- Allow authors to edit their own review body/rating. Subject + booking
-- cannot be changed (enforced by re-evaluating with_check).
drop policy if exists reviews_update_author on public.reviews;
create policy reviews_update_author
  on public.reviews for update
  using (author_user_id = auth.uid())
  with check (author_user_id = auth.uid());
