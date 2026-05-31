-- 20260530000100_message_reads.sql
-- Per-conversation read tracking, for offline "you missed this" prompts.
-- Owner: Database agent.
--
-- WHY: messages have no read state, so when a user is offline and a
-- message/request arrives, there's nothing to tell them on next login —
-- they'd have to dig into /chat manually. This table records the last
-- time each user read each booking's thread. A message is "unread" for a
-- user when it was sent (by someone else) after that user's last_read_at
-- for the booking — or if no read row exists yet.
--
-- Written when a user opens a thread (GET /api/messaging/[bookingId]).
-- Read by GET /api/notifications/summary to compute the login digest.
--
-- One row per (user, booking). RLS: a user only ever sees / writes their
-- own read marks.
--
-- Idempotent.

create table if not exists public.message_reads (
  user_id      uuid not null references public.users(id) on delete cascade,
  booking_id   uuid not null references public.bookings(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, booking_id)
);

create index if not exists message_reads_user_idx on public.message_reads (user_id);

alter table public.message_reads enable row level security;

-- Owner-only access. auth.uid() = user_id for every operation.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='message_reads' and policyname='message_reads_select_own'
  ) then
    create policy message_reads_select_own on public.message_reads
      for select to authenticated using (user_id = auth.uid());
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='message_reads' and policyname='message_reads_insert_own'
  ) then
    create policy message_reads_insert_own on public.message_reads
      for insert to authenticated with check (user_id = auth.uid());
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='message_reads' and policyname='message_reads_update_own'
  ) then
    create policy message_reads_update_own on public.message_reads
      for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end $$;

grant select, insert, update on public.message_reads to authenticated, service_role;
