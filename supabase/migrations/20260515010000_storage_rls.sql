-- 20260515010000_storage_rls.sql
-- Row Level Security for Supabase Storage objects.
-- Owner: Database agent.
--
-- Buckets used by the Auth & Identity agent:
--   - avatars      : public; one folder per user (`<userId>/...`); the
--                    discovery list renders avatars via the bucket's
--                    public URL, which bypasses RLS by design.
--   - verification : private; one folder per user (`<userId>/...`); only
--                    the owner and the service role may read.
--
-- The current Auth agent uploader uses the service-role client to do the
-- writes (so RLS is bypassed during upload) and enforces the
-- `<userId>/...` prefix in application code. These policies are the
-- defense-in-depth layer: they fence direct client (anon/JWT) access so
-- a compromised browser bearer token cannot escape its prefix or read
-- another user's verification document.
--
-- Idempotent: `drop policy if exists` + `do $$` extension guard +
-- `on conflict do nothing` for the bucket rows. Safe to re-run.

-- ---------------------------------------------------------------------------
-- Bucket rows
-- ---------------------------------------------------------------------------
-- Buckets are normally created on first use by the Auth uploader. We
-- create them here too so a fresh project that has never executed an
-- upload still has the RLS policies attached to existing buckets when
-- the application starts.
insert into storage.buckets (id, name, public)
values
  ('avatars', 'avatars', true),
  ('verification', 'verification', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- avatars
-- ---------------------------------------------------------------------------
-- Public reads (selects). Even though the bucket is marked public so
-- /storage/v1/object/public/... URLs work, RLS on storage.objects is
-- still consulted by direct-API reads; declaring the SELECT policy
-- explicitly keeps the access model legible.
drop policy if exists "avatars_select_public" on storage.objects;
create policy "avatars_select_public"
  on storage.objects for select
  using (bucket_id = 'avatars');

-- Inserts/updates/deletes are owner-only: the object key must begin
-- with the caller's auth.uid() followed by '/'. This matches the
-- `<userId>/avatar-<ts>.<ext>` convention enforced by
-- lib/auth/storage.ts#uploadAvatar.
drop policy if exists "avatars_insert_owner" on storage.objects;
create policy "avatars_insert_owner"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and auth.uid() is not null
    and name like (auth.uid()::text || '/%')
  );

drop policy if exists "avatars_update_owner" on storage.objects;
create policy "avatars_update_owner"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and auth.uid() is not null
    and name like (auth.uid()::text || '/%')
  )
  with check (
    bucket_id = 'avatars'
    and auth.uid() is not null
    and name like (auth.uid()::text || '/%')
  );

drop policy if exists "avatars_delete_owner" on storage.objects;
create policy "avatars_delete_owner"
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and auth.uid() is not null
    and name like (auth.uid()::text || '/%')
  );

-- ---------------------------------------------------------------------------
-- verification
-- ---------------------------------------------------------------------------
-- Reads are restricted to the owner. A future admin-review surface will
-- run with the service role (RLS bypass) until a dedicated admin role
-- exists, at which point this policy gains an `or auth.role() = 'admin'`
-- branch (flagged for Trust & Safety phase).
drop policy if exists "verification_select_owner" on storage.objects;
create policy "verification_select_owner"
  on storage.objects for select
  using (
    bucket_id = 'verification'
    and auth.uid() is not null
    and name like (auth.uid()::text || '/%')
  );

drop policy if exists "verification_insert_owner" on storage.objects;
create policy "verification_insert_owner"
  on storage.objects for insert
  with check (
    bucket_id = 'verification'
    and auth.uid() is not null
    and name like (auth.uid()::text || '/%')
  );

-- No UPDATE policy: identity documents are write-once.
drop policy if exists "verification_update_owner" on storage.objects;

-- DELETE only by the owner. The service role bypasses RLS, so the admin
-- review tool can still remove rows after disposition.
drop policy if exists "verification_delete_owner" on storage.objects;
create policy "verification_delete_owner"
  on storage.objects for delete
  using (
    bucket_id = 'verification'
    and auth.uid() is not null
    and name like (auth.uid()::text || '/%')
  );
