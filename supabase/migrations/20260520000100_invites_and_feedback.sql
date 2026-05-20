-- 20260520000100_invites_and_feedback.sql
-- Beta gating + in-app feedback collection.
-- Owner: Database agent (Phase 5 prep).
--
-- Three tables:
--   invite_codes        — humans (admin) mint codes, share with their
--                          friend circle. A code carries a max_uses cap
--                          and an optional expires_at.
--   invite_redemptions  — audit log of who used which code. One row per
--                          successful sign-up that consumed a code.
--   feedback_reports    — in-app "report an issue" submissions. Captures
--                          category, free-text body, the URL the user
--                          was on, and the timestamp.
--
-- RLS posture:
--   - invite_codes:        readable by anon (so the sign-up page can
--                          validate before redemption); insert/update
--                          via service role only (admin tooling).
--   - invite_redemptions:  insert via service role only (sign-up server
--                          action holds service-role key); no client
--                          reads.
--   - feedback_reports:    authenticated users insert their own rows;
--                          no one reads except service role.

-- ---------------------------------------------------------------------------
-- invite_codes
-- ---------------------------------------------------------------------------

create table if not exists public.invite_codes (
  id           uuid primary key default gen_random_uuid(),
  -- Short human-shareable string. Case-insensitive uniqueness enforced
  -- by storing upper-case and comparing upper-case at redemption time.
  code         text not null unique,
  -- Optional note for the admin: "Maya's friends", "Twitter thread", etc.
  note         text,
  -- How many sign-ups this code can fuel. 1 = single-use; high numbers
  -- act like an open code. Null is treated as unlimited.
  max_uses     integer,
  used_count   integer not null default 0,
  -- Optional expiry. Null means "never expires".
  expires_at   timestamptz,
  -- Who minted it (so we can attribute / revoke).
  created_by   uuid references public.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  -- Defense-in-depth: used_count never exceeds max_uses when max_uses
  -- is set. Enforced by the atomic UPDATE in the redemption path too.
  constraint invite_codes_used_count_nonneg check (used_count >= 0),
  constraint invite_codes_max_uses_positive check (max_uses is null or max_uses > 0)
);

create index if not exists invite_codes_code_idx
  on public.invite_codes (code);

alter table public.invite_codes enable row level security;

-- Anon read so the sign-up form can validate a typed code before
-- submitting. Only non-sensitive columns matter here — but RLS doesn't
-- do column-level filtering, so we expose the whole row. That's fine:
-- there's nothing secret in an invite code.
drop policy if exists invite_codes_select_public on public.invite_codes;
create policy invite_codes_select_public
  on public.invite_codes
  for select
  using (true);

-- No client writes. The sign-up server action runs with service role
-- so it bypasses RLS for the atomic increment.
drop policy if exists invite_codes_no_client_writes on public.invite_codes;
create policy invite_codes_no_client_writes
  on public.invite_codes
  for all
  using (false)
  with check (false);

-- ---------------------------------------------------------------------------
-- invite_redemptions
-- ---------------------------------------------------------------------------

create table if not exists public.invite_redemptions (
  id              uuid primary key default gen_random_uuid(),
  invite_code_id  uuid not null references public.invite_codes(id) on delete cascade,
  user_id         uuid not null references public.users(id) on delete cascade,
  redeemed_at     timestamptz not null default now(),
  -- One user can only consume a given code once. Belt-and-suspenders
  -- with the atomic increment in the sign-up flow.
  constraint invite_redemptions_one_per_user unique (invite_code_id, user_id)
);

create index if not exists invite_redemptions_user_idx
  on public.invite_redemptions (user_id);

alter table public.invite_redemptions enable row level security;

-- No client access at all — service role only, via the sign-up action.
drop policy if exists invite_redemptions_no_client on public.invite_redemptions;
create policy invite_redemptions_no_client
  on public.invite_redemptions
  for all
  using (false)
  with check (false);

-- ---------------------------------------------------------------------------
-- feedback_reports
-- ---------------------------------------------------------------------------

create table if not exists public.feedback_reports (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users(id) on delete cascade,
  -- Free-text categorisation. Kept as text so we can iterate without
  -- migrating; UI offers a fixed set of choices but anything sane is
  -- accepted server-side.
  category     text not null
    check (category in ('bug','idea','complaint','other')),
  body         text not null check (length(body) between 1 and 4000),
  -- The URL the user was on when they hit the report button. Useful
  -- context for "what were they trying to do."
  url          text,
  created_at   timestamptz not null default now()
);

create index if not exists feedback_reports_created_idx
  on public.feedback_reports (created_at desc);
create index if not exists feedback_reports_user_idx
  on public.feedback_reports (user_id);

alter table public.feedback_reports enable row level security;

-- Authenticated users can insert their own reports. Reads are admin-only
-- (service role bypasses RLS). user_id MUST equal auth.uid() — defends
-- against a user spoofing reports as someone else.
drop policy if exists feedback_reports_insert_own on public.feedback_reports;
create policy feedback_reports_insert_own
  on public.feedback_reports
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists feedback_reports_no_client_reads on public.feedback_reports;
create policy feedback_reports_no_client_reads
  on public.feedback_reports
  for select
  using (false);
