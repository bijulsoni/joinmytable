-- 20260529000200_users_gender_prefs.sql
-- Add gender + "interested in meeting" preference to users.
-- Owner: Database agent (Wave 3 — preferences + soft ranking).
--
-- WHY: Discovery should rank people the seeker is more likely to want
-- to meet higher. We collect two optional fields at /welcome:
--   gender         — the user's own gender
--   interested_in  — which genders they're interested in meeting
--
-- Both are OPTIONAL. NULL means "prefer not to say" / "open to all" and
-- is treated as a non-signal by the ranking — never a hard filter. This
-- matters for the cold-start phase: with a small companion pool we must
-- not shrink anyone's feed to zero, so unknown/unset preferences always
-- pass. See 20260529000300_search_soft_match.sql for the scoring.
--
-- Allowed values intentionally minimal for the MVP: man / woman /
-- nonbinary. Stored as text (matching the rest of the schema's
-- text+CHECK convention rather than Postgres ENUM types) so adding a
-- value later is a CHECK swap, not an ALTER TYPE.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + guarded constraint adds.

alter table public.users
  add column if not exists gender text,
  add column if not exists interested_in text[];

-- gender ∈ {man, woman, nonbinary} or NULL.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'users_gender_check'
  ) then
    alter table public.users
      add constraint users_gender_check
      check (gender is null or gender in ('man', 'woman', 'nonbinary'));
  end if;
end $$;

-- interested_in: NULL, or an array whose every element is an allowed
-- gender value. `<@` is "is contained by" — empty array passes too.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'users_interested_in_check'
  ) then
    alter table public.users
      add constraint users_interested_in_check
      check (
        interested_in is null
        or interested_in <@ array['man', 'woman', 'nonbinary']::text[]
      );
  end if;
end $$;

comment on column public.users.gender is
  'User''s own gender (man|woman|nonbinary). NULL = prefer not to say.';
comment on column public.users.interested_in is
  'Genders the user is interested in meeting. NULL/empty = open to all. Soft ranking signal only, never a hard filter.';
