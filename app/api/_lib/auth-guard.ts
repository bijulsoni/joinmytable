import 'server-only';

// Auth/authorization guards for Core API route handlers.
//
// Route-handler version of `lib/auth/session.ts` helpers that return a
// JSON 401/409 response instead of redirecting. Every gate re-reads the
// session from the Supabase cookie and re-queries `public.users` for
// the mirrored row.
//
// `requireAuth` enforces "signed-in user with a mirrored users row".
// `requireVerifiedCompanion` additionally enforces "the caller has a
// verified companion_profiles row" — used to gate endpoints that only
// make sense for a companion who is actually discoverable.
//
// Historical note: this module previously exposed `requireSeekerMode`
// and `requireCompanionMode` checks against `users.is_seeker` /
// `users.is_companion` flags. Those mode flags were removed when we
// merged the seeker/companion split into a single role-less UI; any
// gate that needed "is the caller someone who can be paid for an
// activity?" now means "has the caller set up + verified a companion
// profile?" — derived, not flag-driven.

import type { NextResponse } from 'next/server';
import { apiError } from './errors';
import { apiServerClient, type LooseSupabaseClient } from './supabase';
import type { UserRow } from '@/lib/types';

export interface AuthedCaller {
  userId: string;
  email: string;
  profile: UserRow;
  supabase: LooseSupabaseClient;
}

export type AuthResult = { ok: true; caller: AuthedCaller } | { ok: false; response: NextResponse };

export async function requireAuth(): Promise<AuthResult> {
  const supabase = await apiServerClient();
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr || !auth?.user) {
    return { ok: false, response: apiError('unauthenticated', 'Sign in to continue.') };
  }

  const { data: profile, error: profileErr } = await supabase
    .from('users')
    .select('*')
    .eq('id', auth.user.id)
    .maybeSingle();

  if (profileErr) {
    return {
      ok: false,
      response: apiError('internal_error', 'Could not load profile.'),
    };
  }
  if (!profile) {
    // Auth row exists but no mirror row yet; Auth & Identity creates the
    // mirror at sign-up. Treat as "complete your account" rather than 401.
    return {
      ok: false,
      response: apiError('forbidden', 'Finish setting up your account before continuing.'),
    };
  }

  return {
    ok: true,
    caller: {
      userId: auth.user.id,
      email: auth.user.email ?? '',
      profile: profile as UserRow,
      supabase,
    },
  };
}

/**
 * Require the caller to have a verified companion_profiles row.
 * Replaces the old `requireCompanionMode` flag-based gate. Used by
 * endpoints that only make sense for a companion who is actually
 * discoverable (accepting requests, etc.).
 *
 * The Setup-your-companion-profile endpoints do NOT use this gate —
 * they're how a user becomes a companion in the first place. They use
 * `requireAuth` + RLS instead.
 */
export async function requireVerifiedCompanion(): Promise<AuthResult> {
  const result = await requireAuth();
  if (!result.ok) return result;
  const { data, error } = await result.caller.supabase
    .from('companion_profiles')
    .select('verified_at')
    .eq('user_id', result.caller.userId)
    .maybeSingle();
  if (error) {
    return {
      ok: false,
      response: apiError('internal_error', 'Could not check companion status.'),
    };
  }
  const row = data as { verified_at: string | null } | null;
  if (!row || !row.verified_at) {
    return {
      ok: false,
      response: apiError(
        'companion_mode_required',
        'Set up + verify your companion profile to take this action.',
      ),
    };
  }
  return result;
}
