import 'server-only';

// Invite-code gate primitives — preflight, claim, release.
//
// Extracted from app/(auth)/sign-up/actions.ts so the OAuth callback
// (app/(auth)/callback/route.ts) enforces the SAME private-beta gate as
// the email/password sign-up path. The invite gate is a beta invariant:
// every new account — email OR social — must consume a valid invite.
// Keeping one implementation means the race-safety and rollback
// semantics can never drift between the two entry points.
//
// All three use the service-role admin client: by the time they run we
// are already past the public auth boundary, so anon RLS visibility is
// irrelevant and we need to read/mutate invite bookkeeping directly.

import { createSupabaseAdminClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';

const log = logger.child({ module: 'auth.invite' });

export interface InviteCodeRow {
  id: string;
  code: string;
  max_uses: number | null;
  used_count: number;
  expires_at: string | null;
}

/**
 * Confirm the code exists and still has capacity. Returns the row so the
 * caller can claim it. max_uses === null means an unlimited (channel)
 * code — never capacity-blocked.
 */
export async function preflightInvite(
  code: string,
): Promise<{ ok: true; row: InviteCodeRow } | { ok: false; message: string }> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('invite_codes')
    .select('id, code, max_uses, used_count, expires_at')
    .eq('code', code)
    .maybeSingle();
  if (error) {
    return { ok: false, message: 'Could not verify invite code.' };
  }
  if (!data) {
    return { ok: false, message: 'That invite code isn’t valid.' };
  }
  const row = data as InviteCodeRow;
  if (row.expires_at && Date.parse(row.expires_at) < Date.now()) {
    return { ok: false, message: 'That invite code has expired.' };
  }
  if (row.max_uses !== null && row.used_count >= row.max_uses) {
    return { ok: false, message: 'That invite code is fully redeemed.' };
  }
  return { ok: true, row };
}

/**
 * Atomically claim one slot. Race-safe: the UPDATE filters on
 * used_count = row.used_count so two parallel redemptions of a last-slot
 * code can't both succeed. Writes an audit row to invite_redemptions.
 *
 * The admin client is cast to a loose shape for these calls because the
 * typed Database overlay's chained .update().eq().eq().lt() resolves the
 * argument type to `never` in some versions of @supabase/supabase-js.
 * The schema is enforced by the DB itself, so loose typing here is safe.
 */
export async function claimInvite(row: InviteCodeRow, userId: string): Promise<boolean> {
  const admin = createSupabaseAdminClient() as unknown as {
    from: (table: string) => {
      update: (patch: Record<string, unknown>) => {
        eq: (
          col: string,
          val: unknown,
        ) => {
          eq: (
            col: string,
            val: unknown,
          ) => {
            lt: (
              col: string,
              val: unknown,
            ) => {
              select: (cols: string) => {
                maybeSingle: () => Promise<{ data: { id: string } | null; error: unknown }>;
              };
            };
            select: (cols: string) => {
              maybeSingle: () => Promise<{ data: { id: string } | null; error: unknown }>;
            };
          };
        };
      };
      insert: (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
    };
  };
  const baseUpdate = admin
    .from('invite_codes')
    .update({ used_count: row.used_count + 1 })
    .eq('id', row.id)
    .eq('used_count', row.used_count);
  const queried =
    row.max_uses !== null
      ? baseUpdate.lt('used_count', row.max_uses).select('id').maybeSingle()
      : baseUpdate.select('id').maybeSingle();
  const { data, error } = await queried;
  if (error || !data) return false;

  const { error: redErr } = await admin
    .from('invite_redemptions')
    .insert({ invite_code_id: row.id, user_id: userId });
  if (redErr) {
    log.warn({ err: redErr.message, userId }, 'invite redemption insert failed (claim succeeded)');
    // Audit row missed but the slot is claimed. Acceptable for beta.
  }
  return true;
}

/**
 * Release a previously-claimed slot. Used when account creation fails
 * after the claim so an orphan claim doesn't lock out a code's last
 * seat. Best-effort: errors are logged, not thrown.
 */
export async function releaseInvite(row: InviteCodeRow, userId: string): Promise<void> {
  try {
    const admin = createSupabaseAdminClient() as unknown as {
      from: (table: string) => {
        update: (patch: Record<string, unknown>) => {
          eq: (col: string, val: unknown) => Promise<{ error: { message: string } | null }>;
        };
        delete: () => {
          eq: (
            col: string,
            val: unknown,
          ) => {
            eq: (col2: string, val2: unknown) => Promise<{ error: { message: string } | null }>;
          };
        };
      };
    };
    await admin
      .from('invite_codes')
      .update({ used_count: Math.max(0, row.used_count) })
      .eq('id', row.id);
    await admin
      .from('invite_redemptions')
      .delete()
      .eq('invite_code_id', row.id)
      .eq('user_id', userId);
  } catch (err) {
    log.error(
      { err: err instanceof Error ? err.message : String(err) },
      'invite slot release failed',
    );
  }
}
