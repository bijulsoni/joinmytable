import 'server-only';

// Verification flow (new schema).
//
// The `users` table carries a single `verification_status` enum:
// 'unverified' | 'pending' | 'verified'. Companions submit a
// verification request which moves their users.verification_status from
// 'unverified' to 'pending'. The transition to 'verified' is reserved
// for the admin / review path. Until 'verified', RLS hides the
// companion's profile from discovery (core product rule #10).
//
// Seekers don't have a separate verification flow — the same column
// applies, but companion-specific gating only fires when is_companion
// is true.

import { authServerClient } from './db';
import type { UserUpdate, VerificationStatus } from '@/lib/types';

export interface CompanionVerificationInput {
  /** Free-text legal name as presented on ID. */
  legalName: string;
  /** Verification photo path in Supabase Storage (id document). */
  documentPath: string;
}

/**
 * Move the signed-in companion's verification status to 'pending'.
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

  const supabase = await authServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: 'Not signed in.' };

  const { data: rowRaw, error: readErr } = await supabase
    .from('users')
    .select('verification_status, is_companion')
    .eq('id', auth.user.id)
    .maybeSingle();

  if (readErr) return { ok: false, error: readErr.message };
  const row = rowRaw as { verification_status: VerificationStatus; is_companion: boolean } | null;
  if (!row) {
    return { ok: false, error: 'Profile not found.' };
  }
  if (!row.is_companion) {
    return { ok: false, error: 'Enable companion mode before requesting verification.' };
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
