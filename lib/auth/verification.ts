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

  // If a government ID was provided, stamp id_submitted_at so the admin
  // full-ID review queue surfaces this person. This is what was missing:
  // an already-'verified' Basic companion adding their ID would otherwise
  // hit the early-return below and leave NO signal anywhere — the ID sat
  // in storage, unreviewable. We do NOT move a Basic companion back to
  // 'pending' (that would drop them out of Explore); id_submitted_at is a
  // separate signal that keeps them discoverable while their ID is reviewed.
  if (input.documentPath) {
    const nowIso = new Date().toISOString();
    const { data: cpRow } = await supabase
      .from('companion_profiles')
      .select('user_id')
      .eq('user_id', auth.user.id)
      .maybeSingle();
    if (cpRow) {
      await supabase
        .from('companion_profiles')
        .update({ id_submitted_at: nowIso })
        .eq('user_id', auth.user.id);
    } else {
      await supabase
        .from('companion_profiles')
        .insert({ user_id: auth.user.id, id_submitted_at: nowIso });
    }
  }

  // Status transition: a brand-new applicant (unverified) moves to
  // 'pending' for first review. An already verified/pending user stays as
  // is — a Basic companion adding an ID keeps their 'verified' status (and
  // Explore visibility); the id_submitted_at stamp above queues the review.
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

/**
 * Save the companion's payout details on their companion_profiles row
 * (creating the row if it doesn't exist yet). Admin-only data — never
 * surfaced to seekers. Best-effort; returns ok/false without throwing.
 */
export async function saveCompanionPayout(input: {
  method: 'venmo' | 'zelle' | 'paypal';
  handle: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await authServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: 'Not signed in.' };
  const userId = auth.user.id;

  const patch = { payout_method: input.method, payout_handle: input.handle.trim() };

  // No unique constraint on companion_profiles.user_id, so select-then-
  // write rather than upsert (mirrors the /welcome onboarding action).
  const { data: existing } = await supabase
    .from('companion_profiles')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase.from('companion_profiles').update(patch).eq('user_id', userId);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase
      .from('companion_profiles')
      .insert({ user_id: userId, ...patch });
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true };
}
