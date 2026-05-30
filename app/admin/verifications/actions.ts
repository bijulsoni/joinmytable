'use server';

// Server actions for the /admin/verifications console.
//
// Defense in depth: the /admin layout already gates every route through
// requireAdmin(), but server actions are independently callable (they're
// just POST endpoints), so this action re-checks requireAdmin() before
// touching the database.
//
// The approve/revoke writes mirror scripts/db/verify-companion.mjs exactly:
//   approve → companion_profiles.verified_at = now()
//             users.verification_status = 'verified'
//   reject  → companion_profiles.verified_at = null
//             users.verification_status = 'unverified'

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/admin';
import { authAdminClient } from '@/lib/auth/db';
import { logger } from '@/lib/logger';

const log = logger.child({ module: 'admin-verifications' });

const Schema = z.object({
  userId: z.string().uuid('Invalid user id.'),
  decision: z.enum(['approve', 'reject']),
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

  // reject = revoke. Same two writes as the CLI script, just inverted values.
  const revoke = decision === 'reject';
  const verifiedAt = revoke ? null : new Date().toISOString();
  const userStatus = revoke ? 'unverified' : 'verified';

  const admin = authAdminClient();

  // companion_profiles.verified_at gates discoverability.
  const { error: cpErr } = await admin
    .from('companion_profiles')
    .update({ verified_at: verifiedAt })
    .eq('user_id', userId);
  if (cpErr) {
    log.error({ err: cpErr.message, userId, decision }, 'companion_profiles update failed');
    return { ok: false, error: 'Could not update the companion profile. Please try again.' };
  }

  // users.verification_status is the account-level signal.
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
