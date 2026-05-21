'use server';

// Server action backing the sign-up form.
//
// The seeker/companion mode toggle was removed — every user is now a
// seeker by default (they can send requests) and becomes discoverable
// as a companion by setting up a verified companion profile from
// /profile after sign-up. The legacy is_seeker/is_companion columns
// still exist on `users` (DB CHECK constraint requires at least one);
// we default both to true so seeded data stays consistent and so a
// freshly signed-up user can immediately start a companion profile if
// they want without flipping flags first.

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server';
import { createUserMirrorRow } from '@/lib/auth/profile';
import { logger } from '@/lib/logger';

const log = logger.child({ module: 'auth.sign-up' });

const SignUpSchema = z.object({
  email: z.string().email('Enter a valid email address.'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters.')
    .max(72, 'Password is too long.'),
  name: z.string().min(1, 'Name is required.').max(80, 'Name is too long.'),
  // Invite code is required for the beta. Stored upper-case for
  // case-insensitive lookup.
  inviteCode: z
    .string()
    .min(4, 'Invite code is required.')
    .max(40, 'That doesn’t look like a valid invite code.')
    .transform((s) => s.trim().toUpperCase()),
  acceptGuidelines: z
    .boolean()
    .refine((v) => v === true, 'You must accept the community guidelines.'),
});

interface InviteCodeRow {
  id: string;
  code: string;
  max_uses: number | null;
  used_count: number;
  expires_at: string | null;
}

// Preflight: confirm the code exists and still has capacity. Returns
// the row so we can claim it later. Uses the service-role client so
// anon RLS visibility doesn't matter (we're already past the public
// auth boundary by the time this runs).
async function preflightInvite(
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

// Atomically claim one slot on the invite. Returns true if claimed.
// Race-safe: the UPDATE filters on used_count = row.used_count so two
// parallel redemptions of a last-slot code can't both succeed.
//
// The admin client is cast to `any` for these calls because the typed
// Database overlay's chained .update().eq().eq().lt() resolves the
// argument type to `never` in some versions of @supabase/supabase-js.
// The schema is enforced by the DB itself + the migration's CHECK
// constraints, so loose typing here is safe.
async function claimInvite(row: InviteCodeRow, userId: string): Promise<boolean> {
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
    // Audit row missed but the slot is claimed. Acceptable for beta —
    // we still know who consumed which code via auth.created_at + manual
    // SQL if needed.
  }
  return true;
}

export type SignUpState = { status: 'idle' } | { status: 'error'; message: string };

export async function signUpAction(_prev: SignUpState, formData: FormData): Promise<SignUpState> {
  const parsed = SignUpSchema.safeParse({
    email: String(formData.get('email') ?? '')
      .trim()
      .toLowerCase(),
    password: String(formData.get('password') ?? ''),
    name: String(formData.get('name') ?? '').trim(),
    inviteCode: String(formData.get('inviteCode') ?? ''),
    acceptGuidelines: formData.get('acceptGuidelines') === 'on',
  });

  if (!parsed.success) {
    return {
      status: 'error',
      message: parsed.error.issues[0]?.message ?? 'Invalid sign-up details.',
    };
  }

  // Beta gate: validate the invite code before we hit Supabase Auth.
  // Cheaper than creating an auth user we'll need to clean up later.
  const preflight = await preflightInvite(parsed.data.inviteCode);
  if (!preflight.ok) {
    return { status: 'error', message: preflight.message };
  }

  const supabase = await createSupabaseServerClient();
  const { data: authResult, error: authError } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { name: parsed.data.name },
    },
  });

  if (authError || !authResult.user) {
    log.warn({ err: authError?.message }, 'sign-up failed');
    return {
      status: 'error',
      message: authError?.message ?? 'Could not create an account.',
    };
  }

  // Anti-enumeration shape from Supabase Auth: when the email already
  // exists in auth.users, signUp() returns a "fake" user with empty
  // identities[] and a bogus id (so attackers can't probe for who's
  // registered). If we don't catch this, the mirror-row insert below
  // would fail with users_id_fkey because the id doesn't match an
  // actual auth.users row — and worse, we'd burn an invite-code slot.
  if (!authResult.user.identities || authResult.user.identities.length === 0) {
    return {
      status: 'error',
      message: 'An account already exists for this email. Sign in instead.',
    };
  }

  // Atomically claim a slot. If someone else just took the last slot
  // between preflight and here (race on a 1-use code), bail with a
  // clear message. The orphan auth user is left in place — the email
  // can still recover and try again with a different code.
  const claimed = await claimInvite(preflight.row, authResult.user.id);
  if (!claimed) {
    log.warn({ code: parsed.data.inviteCode }, 'invite claim lost the race');
    return {
      status: 'error',
      message: 'That invite code was just used by someone else. Please try a different one.',
    };
  }

  // Both flags default to true. The user is_seeker (everyone can send
  // requests) — and is_companion is kept on so that companion-profile
  // setup is one-step (no flag flip). Discoverability is gated on the
  // companion_profiles row's verified_at, not on this flag.
  const mirror = await createUserMirrorRow({
    authUserId: authResult.user.id,
    email: parsed.data.email,
    name: parsed.data.name,
    isSeeker: true,
    isCompanion: true,
  });
  if (!mirror.ok) {
    log.error({ err: mirror.error }, 'mirror row insert failed');
    // Rollback the auth.users row we just created. Otherwise the email
    // gets stuck — future sign-up attempts hit Supabase's anti-enumeration
    // path and the user can never recover. Service-role admin client
    // cleans up; failures here are logged but not surfaced because the
    // user-facing message below is what matters.
    try {
      const admin = createSupabaseAdminClient();
      const { error: rollbackErr } = await admin.auth.admin.deleteUser(authResult.user.id);
      if (rollbackErr) {
        log.error(
          { err: rollbackErr.message, userId: authResult.user.id },
          'orphan rollback failed',
        );
      }
    } catch (err) {
      log.error({ err: err instanceof Error ? err.message : String(err) }, 'orphan rollback threw');
    }
    return { status: 'error', message: mirror.error };
  }

  if (authResult.session) {
    redirect('/discover');
  }
  redirect('/check-email');
}
