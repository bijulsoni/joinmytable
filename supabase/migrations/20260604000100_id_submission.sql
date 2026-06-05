-- Basic -> Full ID upgrade signal.
--
-- A "Basic" companion (verification_status='verified', id_verified_at NULL)
-- who later uploads a government ID was getting lost: submitCompanionVerification
-- early-returned for an already-'verified' user (no state change), and the
-- admin queue only lists users with verification_status='pending' — so the
-- uploaded ID sat in storage with nothing pointing the admin at it.
--
-- We must NOT flip a Basic companion back to 'pending' to queue the review:
-- that would drop them out of Explore (RLS gates discovery on 'verified')
-- while their ID is reviewed. Instead, record the submission separately.
--
--   id_submitted_at set + id_verified_at NULL  -> awaiting full-ID review
--   (the admin queue surfaces these alongside brand-new 'pending' applicants)

alter table public.companion_profiles
  add column if not exists id_submitted_at timestamptz;

comment on column public.companion_profiles.id_submitted_at is
  'When the companion uploaded a government ID for full verification. Set on submit, cleared on the admin decision. id_submitted_at set + id_verified_at NULL = awaiting full-ID review (stays discoverable as Basic meanwhile).';
