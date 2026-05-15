import 'server-only';

// Verification flow.
//
// Two intensities, mirroring the product spec:
//
// - Seeker (lighter): email confirmation (Supabase Auth) + community
//   guidelines acceptance. When both are satisfied,
//   users.seeker_verification_status moves to 'verified'. RLS does not
//   gate seeker discoverability on this field; it is informational and
//   surfaces a "Verified seeker" badge to companions.
//
// - Companion (stronger): submitting the verification request moves
//   companion_profiles.verification_status from 'unverified' to
//   'pending'. The transition to 'verified' is reserved for the admin /
//   review path and is intentionally not exposed in the application
//   surface. Until 'verified', RLS hides the profile from discovery
//   (core product rule #9), enforced in the database.
//
// The actual third-party identity check (Stripe Identity / Persona /
// equivalent) is out of scope for this phase - see MANUAL CHECKPOINTS.

import { authAdminClient, authServerClient } from './db';
import type {
  CompanionProfileUpdate,
  UserRow,
  UserUpdate,
  VerificationStatus,
} from '@/lib/types';

export interface CompanionVerificationInput {
  /**
   * Free-text legal name as presented on ID. Held in the verification
   * submission only; not persisted in `companion_profiles` (which already
   * carries the public display_name on `users`).
   */
  legalName: string;
  /** Verification photo path in Supabase Storage (id document). */
  documentPath: string;
}

interface CompanionVerificationRow {
  user_id: string;
  verification_status: VerificationStatus;
}

/**
 * Move the signed-in companion's verification status to 'pending'.
 * Requires the user to be in companion mode and have a profile row.
 * No-op (and returns success) if already pending/verified - the flow
 * is idempotent so the UI can be safe to retry.
 */
export async function submitCompanionVerification(
  input: CompanionVerificationInput,
): Promise<{ ok: true; status: VerificationStatus } | { ok: false; error: string }> {
  if (!input.legalName.trim()) {
    return { ok: false, error: 'Legal name is required for verification.' };
  }
  if (!input.documentPath.trim()) {
    return { ok: false, error: 'A verification document is required.' };
  }

  const supabase = authServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: 'Not signed in.' };

  const { data: profileRaw, error: readErr } = await supabase
    .from('companion_profiles')
    .select('user_id, verification_status')
    .eq('user_id', auth.user.id)
    .maybeSingle();

  if (readErr) return { ok: false, error: readErr.message };
  const profile = profileRaw as CompanionVerificationRow | null;
  if (!profile) {
    return {
      ok: false,
      error: 'Set up your companion profile before requesting verification.',
    };
  }
  if (profile.verification_status === 'verified') {
    return { ok: true, status: 'verified' };
  }
  if (profile.verification_status === 'pending') {
    return { ok: true, status: 'pending' };
  }

  const update: CompanionProfileUpdate = { verification_status: 'pending' };
  const { data: updated, error: updErr } = await supabase
    .from('companion_profiles')
    .update(update)
    .eq('user_id', auth.user.id)
    .select('verification_status')
    .single();

  if (updErr || !updated) {
    return { ok: false, error: updErr?.message ?? 'Update failed.' };
  }
  return {
    ok: true,
    status: (updated as { verification_status: VerificationStatus })
      .verification_status,
  };
}

/**
 * Light-touch seeker verification: gate moves to 'verified' once the
 * email is confirmed and the guidelines have been accepted. This helper
 * is called from server actions that observe those events so the column
 * stays in sync.
 */
export async function reconcileSeekerVerification(
  userId: string,
): Promise<void> {
  const admin = authAdminClient();

  const { data: authUser } = await admin.auth.admin.getUserById(userId);
  if (!authUser?.user) return;

  const { data: rowRaw } = await admin
    .from('users')
    .select('guidelines_accepted_at, seeker_verification_status, is_seeker')
    .eq('id', userId)
    .maybeSingle();
  const row = rowRaw as Pick<
    UserRow,
    'guidelines_accepted_at' | 'seeker_verification_status' | 'is_seeker'
  > | null;
  if (!row || !row.is_seeker) return;

  const eligible =
    Boolean(authUser.user.email_confirmed_at) &&
    Boolean(row.guidelines_accepted_at);

  const target: VerificationStatus = eligible ? 'verified' : 'unverified';
  if (row.seeker_verification_status === target) return;

  const update: UserUpdate = { seeker_verification_status: target };
  await admin.from('users').update(update).eq('id', userId);
}
