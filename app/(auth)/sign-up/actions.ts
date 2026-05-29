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
import { headers } from 'next/headers';
import { z } from 'zod';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server';
import { createUserMirrorRow } from '@/lib/auth/profile';
import { preflightInvite, claimInvite, releaseInvite } from '@/lib/auth/invite';
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

  // Build an absolute emailRedirectTo so the confirmation link drops the
  // user at /(auth)/callback?next=/welcome — which exchanges the code,
  // sets the session cookie, then redirects into the onboarding flow.
  // Pull host + proto from the incoming request rather than baking an
  // env var in; works for dev (localhost), preview deployments, and
  // production all the same.
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  const origin = `${proto}://${host}`;

  const supabase = await createSupabaseServerClient();
  const { data: authResult, error: authError } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { name: parsed.data.name },
      emailRedirectTo: `${origin}/callback?next=/welcome`,
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
    // Rollback in reverse order of how we acquired the side effects:
    //   1. Release the invite-code slot we just claimed — otherwise the
    //      code's last seat is permanently consumed for a user that
    //      doesn't exist.
    //   2. Delete the auth.users row we just created — otherwise the
    //      email gets stuck on Supabase's anti-enumeration path.
    await releaseInvite(preflight.row, authResult.user.id);
    try {
      const admin = createSupabaseAdminClient();
      const { error: rollbackErr } = await admin.auth.admin.deleteUser(authResult.user.id);
      if (rollbackErr) {
        log.error(
          { err: rollbackErr.message, userId: authResult.user.id },
          'orphan auth rollback failed',
        );
      }
    } catch (err) {
      log.error(
        { err: err instanceof Error ? err.message : String(err) },
        'orphan auth rollback threw',
      );
    }
    return { status: 'error', message: mirror.error };
  }

  // If email confirmation is off (dev convenience), we get a session
  // immediately — drop the user straight into onboarding. Otherwise
  // they'll arrive at /welcome after clicking the confirmation link.
  if (authResult.session) {
    redirect('/welcome');
  }
  redirect('/check-email');
}
