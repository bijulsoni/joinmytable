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
import { notify } from '@/lib/notifications';
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
  // Every decision clears id_submitted_at so the applicant drops out of
  // the full-ID review queue once acted on.
  if (decision === 'reject') {
    cpPatch = { verified_at: null, id_verified_at: null, id_submitted_at: null };
    userStatus = 'unverified';
  } else if (decision === 'approve_basic') {
    // Discoverable, but NOT id-verified (can't accept a meet yet).
    cpPatch = { verified_at: now, id_submitted_at: null };
    userStatus = 'verified';
  } else {
    // approve_full — discoverable AND id-verified (bookable).
    cpPatch = { verified_at: now, id_verified_at: now, id_submitted_at: null };
    userStatus = 'verified';
  }

  // Founding Companion program: the first 100 approved companions get the
  // founding flag (badge + no platform fee). Apply on any approval, only
  // if they aren't already founding and a spot remains. Best-effort — a
  // counting hiccup must never block the approval itself.
  const FOUNDING_CAP = 100;
  if (decision !== 'reject') {
    const { count: foundingCount } = await admin
      .from('companion_profiles')
      .select('id', { count: 'exact', head: true })
      .eq('is_founding', true);
    if ((foundingCount ?? 0) < FOUNDING_CAP) {
      cpPatch.is_founding = true;
    }
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

  // Email the companion that they're live (tier-aware + founding). Fire
  // only on approval; best-effort (never blocks the decision).
  if (decision !== 'reject') {
    void notify('verification_approved', {
      recipient_user_id: userId,
      data: {
        tier: decision === 'approve_full' ? 'full' : 'basic',
        founding: cpPatch.is_founding === true,
      },
    });
  }

  log.info({ userId, decision }, 'verification decided');
  revalidatePath('/admin/verifications');
  return { ok: true };
}
