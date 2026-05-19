-- 20260518000100_realtime_publication.sql
-- Phase 3 — register tables that need live updates with Supabase
-- Realtime's `supabase_realtime` publication.
-- Owner: Core API agent.
--
-- Without this, `supabase.channel(...).on('postgres_changes', ...)`
-- never fires for these tables. Idempotent: each ALTER is guarded so
-- re-running cannot error on already-present tables.

do $$
declare
  t text;
  tables_to_publish constant text[] := array[
    'messages',
    'meal_requests',
    'bookings'
  ];
begin
  foreach t in array tables_to_publish loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end$$;

-- Realtime relays the row to subscribers via RLS-respecting checks, so
-- the existing select policies (messages_select_participant,
-- meal_requests_select_participant, bookings_select_participant) are
-- the gate. No extra grants needed.
