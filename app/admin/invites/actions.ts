'use server';

// Server actions for the /admin/invites console.
//
// Defense in depth: the /admin layout already gates every route through
// requireAdmin(), but server actions are independently callable (they're
// just POST endpoints), so every action here re-checks requireAdmin()
// before touching the database.
//
// Code-minting mirrors scripts/db/mint-invite-codes.mjs exactly:
//   - format        TABLE-XXXX-XX (three dash groups)
//   - alphabet      23456789ABCDEFGHJKMNPQRSTUVWXYZ (no 0/O/1/I/L)
//   - max_uses null means unlimited
//   - optional expires_at + note (the channel label)

import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/admin';
import { authAdminClient } from '@/lib/auth/db';
import { logger } from '@/lib/logger';

const log = logger.child({ module: 'admin-invites' });

// Alphabet: no 0/O, no 1/I/L — so dictation works. Mirrors the mint script.
const ALPHA = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

function randomSegment(len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) {
    s += ALPHA[Math.floor(Math.random() * ALPHA.length)];
  }
  return s;
}

function mintCode(): string {
  // TABLE-XXXX-XX is short enough to dictate, distinctive enough to not
  // be confused for anything else in the wild.
  return `TABLE-${randomSegment(4)}-${randomSegment(2)}`;
}

// max_uses === null means unlimited. The select coerces the chosen option
// into either a positive integer or null before it reaches the action.
const Schema = z.object({
  // The channel label, e.g. "facebook-jan2027". Optional.
  note: z.string().trim().max(200, 'Channel label is too long.').optional(),
  maxUses: z.number().int().positive('Max uses must be positive.').nullable(),
  expiresDays: z
    .number()
    .int()
    .positive('Expiry must be a positive number of days.')
    .max(3650, 'Expiry is too far out.')
    .nullable(),
  count: z
    .number()
    .int()
    .min(1, 'Mint at least one code.')
    .max(50, 'Mint at most 50 codes at a time.'),
});

export type MintCodesInput = z.input<typeof Schema>;

export type MintCodesResult = { ok: true; codes: string[] } | { ok: false; error: string };

export async function mintCodesAction(input: MintCodesInput): Promise<MintCodesResult> {
  // Server-side authority: re-gate even though the layout already did.
  await requireAdmin();

  const parsed = Schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid submission.' };
  }
  const { note, maxUses, expiresDays, count } = parsed.data;

  const expiresAt =
    expiresDays === null
      ? null
      : new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000).toISOString();

  const rows = Array.from({ length: count }, () => ({
    code: mintCode(),
    note: note && note.length > 0 ? note : null,
    max_uses: maxUses,
    expires_at: expiresAt,
  }));

  const admin = authAdminClient();
  const { data, error } = await admin.from('invite_codes').insert(rows).select('code');
  if (error) {
    log.error({ err: error.message }, 'invite code insert failed');
    return { ok: false, error: 'Could not mint codes. Please try again.' };
  }

  const codes = (data ?? []).map((r: { code: string }) => r.code);
  log.info({ count: codes.length, note: note ?? null }, 'minted invite codes');
  return { ok: true, codes };
}
