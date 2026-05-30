-- 20260529000500_waitlist.sql
-- Waitlist for out-of-region signups during the controlled rollout.
-- Owner: Database agent (Wave 5 — beta signals + PNW gate).
--
-- WHY: The beta opens region by region (Seattle/Bellevue first). When a
-- new user's geolocation falls outside the open service area we soft-
-- block them and offer to capture their email so we can (a) tell them
-- when we expand and (b) PRIORITIZE which region to open next by where
-- demand is. We store the coordinates + the reverse-geocoded city label
-- so the next-region decision is data-driven.
--
-- RLS: an anonymous / freshly-signed-up user must be able to INSERT their
-- own waitlist row (they're blocked from the app, so the join happens
-- from a low-privilege context). Nobody can SELECT via anon/authenticated
-- — only the service role (admin console) reads it. No updates/deletes
-- from the client.
--
-- Idempotent.

create table if not exists public.waitlist (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  lat         double precision,
  lng         double precision,
  city        text,
  source      text default 'region_gate',
  created_at  timestamptz default now()
);

-- One row per email is plenty. The app lowercases every email before
-- insert, so a plain unique constraint on the column dedupes correctly
-- AND is usable as an ON CONFLICT (email) upsert target (a functional
-- index on lower(email) is NOT — Postgres can't match a bare column to
-- it). Keep it a column-level unique so upserts work.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'waitlist_email_key'
  ) then
    alter table public.waitlist add constraint waitlist_email_key unique (email);
  end if;
end $$;

alter table public.waitlist enable row level security;

-- INSERT: allow anyone (anon or authenticated) to add themselves.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'waitlist' and policyname = 'waitlist_insert_any'
  ) then
    create policy waitlist_insert_any
      on public.waitlist for insert
      to anon, authenticated
      with check (true);
  end if;
end $$;

-- No SELECT/UPDATE/DELETE policies for anon/authenticated → service role
-- (admin console) is the only reader. RLS denies by default.

grant insert on public.waitlist to anon, authenticated;
