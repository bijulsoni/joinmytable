-- 20260522000100_role_grants.sql
-- Ensure the Supabase API roles can actually touch the schema.
-- Owner: Database agent (Phase 6 — production deploy hardening).
--
-- WHY: When a fresh Supabase project is created and migrations run
-- before the platform's automatic default-privileges templating
-- finishes propagating, tables get created without grants to anon /
-- authenticated / service_role. PostgREST then returns "permission
-- denied for table X" even though RLS would allow the operation.
--
-- This bit us during the first prod deploy of Konnly — the
-- service_role client couldn't even SELECT from users. The fix is
-- idempotent: grants are additive and re-running is a no-op.
--
-- Defense-in-depth: also set DEFAULT PRIVILEGES so any future table
-- created in the public schema inherits the same grants.
--
-- Note on safety: granting raw table privileges to anon and
-- authenticated is fine because RLS still gates which rows they see.
-- The grants get you past the "permission denied" gate; the RLS
-- policies in 20260515000600_rls.sql gate the rows themselves.

grant usage on schema public to anon, authenticated, service_role;

grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;

alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;
