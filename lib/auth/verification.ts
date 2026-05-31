import 'server-only';

// Verification flow.
//
// The `users` table carries a single `verification_status` enum:
// 'unverified' | 'pending' | 'verified'. The applicant uploads a
// government ID + selfie and submits — that flips them to 'pending'.
// The transition to 'verified' is reserved for the admin / review path
// (see scripts/db/verify-companion.mjs). Until 'verified', RLS hides
// the companion profile from /discover (core product rule #10).

import { authServerClient } from './db';
import type { UserUpdate, VerificationStatus } from '@/lib/types';

export interface CompanionVerificationInput {
  /** Free-text legal name as presented on ID. Empty for selfie-only. */
  legalName: string;
  /** Government-ID photo path in Storage. NULL for the selfie-only
   *  (basic) tier — the ID can be added later, at accept time. */
  documentPath: string | null;
  /** Selfie photo path in Supabase Storage (same bucket). Required. */
  selfiePath: string;
}

/**
 * Move the signed-in user's verification status to 'pending'.
 * No-op (and returns success) if already pending/verified — the flow
 * is idempotent so the UI can safely retry.
 *
 * Drops the prior `is_companion` gate: now that the seeker/companion
 * mode flag is decommissioned, any signed-in user can request
 * verification. Anyone with a companion_profiles row + verified status
 * shows up in /discover; everyone else is just verified-as-a-person.
 */
export async function submitCompanionVerification(
  input: CompanionVerificationInput,
): Promise<{ ok: true; status: VerificationStatus } | { ok: false; error: string }> {
  // Selfie is the only hard requirement (basic tier). Legal name + ID are
  // optional here — they're collected for the full tier, either now or
  // when the companion accepts their first request.
  if (!input.selfiePath.trim()) {
    return { ok: false, error: 'A selfie is required.' };
  }

  const supabase = await authServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: 'Not signed in.' };

  const { data: rowRaw, error: readErr } = await supabase
    .from('users')
    .select('verification_status')
    .eq('id', auth.user.id)
    .maybeSingle();

  if (readErr) return { ok: false, error: readErr.message };
  const row = rowRaw as { verification_status: VerificationStatus } | null;
  if (!row) {
    return { ok: false, error: 'Profile not found.' };
  }
  if (row.verification_status === 'verified' || row.verification_status === 'pending') {
    return { ok: true, status: row.verification_status };
  }

  const update: UserUpdate = { verification_status: 'pending' };
  const { data: updated, error: updErr } = await supabase
    .from('users')
    .update(update)
    .eq('id', auth.user.id)
    .select('verification_status')
    .single();

  if (updErr || !updated) {
    return { ok: false, error: updErr?.message ?? 'Update failed.' };
  }
  return {
    ok: true,
    status: (updated as { verification_status: VerificationStatus }).verification_status,
  };
}
