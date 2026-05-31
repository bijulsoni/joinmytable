'use server';

// Server actions for the /admin/verifications console.
//
// Defense in depth: the /admin layout already gates every route through
// requireAdmin(), but server actions are independently callable (they're
// just POST endpoints), so this action re-checks requireAdmin() before
// touching the database.
//
// Tiered approve / revoke (see CLAUDE.md core rule #10, tiered):
//   approve_basic → verified_at = now()         (discoverable, "Basic")
//                   id_verified_at unchanged     (stays null)
//                   verification_status = 'verified'
//   approve_full  → verified_at = now() (if unset) + id_verified_at = now()
//                   verification_status = 'verified'   ("Verified", bookable)
//   reject        → verified_at = null, id_verified_at = null
//                   verification_status = 'unverified'

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/admin';
import { authAdminClient } from '@/lib/auth/db';
import { logger } from '@/lib/logger';

const log = logger.child({ module: 'admin-verifications' });

const Schema = z.object({
  userId: z.string().uuid('Invalid user id.'),
  decision: z.enum(['approve_basic', 'approve_full', 'reject']),
});

export type DecideVerificationInput = z.input<typeof Schema>;

export type DecideVerificationResult = { ok: true } | { ok: false; error: string };

export async function decideVerificationAction(
  input: DecideVerificationInput,
): Promise<DecideVerificationResult> {
  // Server-side authority: re-gate even though the layout already did.
  await requireAdmin();

  const parsed = Schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid submission.' };
  }
  const { userId, decision } = parsed.data;

  const now = new Date().toISOString();
  const admin = authAdminClient();

  // Build the companion_profiles patch per tier.
  let cpPatch: Record<string, unknown>;
  let userStatus: 'unverified' | 'verified';
  if (decision === 'reject') {
    cpPatch = { verified_at: null, id_verified_at: null };
    userStatus = 'unverified';
  } else if (decision === 'approve_basic') {
    // Discoverable, but NOT id-verified (can't accept a meet yet).
    cpPatch = { verified_at: now };
    userStatus = 'verified';
  } else {
    // approve_full — discoverable AND id-verified (bookable).
    cpPatch = { verified_at: now, id_verified_at: now };
    userStatus = 'verified';
  }

  const { error: cpErr } = await admin
    .from('companion_profiles')
    .update(cpPatch)
    .eq('user_id', userId);
  if (cpErr) {
    log.error({ err: cpErr.message, userId, decision }, 'companion_profiles update failed');
    return { ok: false, error: 'Could not update the companion profile. Please try again.' };
  }

  const { error: uErr } = await admin
    .from('users')
    .update({ verification_status: userStatus })
    .eq('id', userId);
  if (uErr) {
    log.error({ err: uErr.message, userId, decision }, 'users update failed');
    return { ok: false, error: 'Could not update the account status. Please try again.' };
  }

  log.info({ userId, decision }, 'verification decided');
  revalidatePath('/admin/verifications');
  return { ok: true };
}
