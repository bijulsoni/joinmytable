-- 20260529000400_users_is_admin.sql
-- Add an admin flag to users for the in-app admin console.
-- Owner: Database agent (Wave 4 — admin UI).
--
-- WHY: Admin actions (minting invite codes, reading feedback, reviewing
-- verifications) currently live in terminal scripts. The admin console
-- at /admin gates on this flag. It is NOT user-settable: there is no RLS
-- policy that lets a user write it, and the only way to set it is the
-- service-role script scripts/db/grant-admin.mjs. Defense in depth — a
-- compromised session still can't self-promote.
--
-- Default false so every existing + future signup is a normal user.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS.

alter table public.users
  add column if not exists is_admin boolean not null default false;

comment on column public.users.is_admin is
  'Grants access to the /admin console. Set ONLY via service-role (scripts/db/grant-admin.mjs); never user-writable.';
