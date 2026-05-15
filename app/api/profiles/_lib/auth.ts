import 'server-only';

// Auth gate for the profiles API.
//
// Route-handler version of `lib/auth/session.ts#requireSessionUser` that
// returns a JSON 401 instead of redirecting. Re-reads the session from
// the cookie on every call (server-side authority).
//
// `requireCompanionMode` additionally enforces core product rule #5
// (one account, two modes) at the API boundary: managing a companion
// profile requires `is_companion=true` on the public.users row.

import type { NextResponse } from 'next/server';
import { apiError } from './errors';
import { profilesServerClient, type LooseSupabaseClient } from './db';
import type { UserRow } from '@/lib/types';

export interface AuthedCaller {
  userId: string;
  email: string;
  profile: UserRow;
  supabase: LooseSupabaseClient;
}

export type AuthResult = { ok: true; caller: AuthedCaller } | { ok: false; response: NextResponse };

/**
 * Require a signed-in user with a mirrored `public.users` row. Returns
 * a `NextResponse` 401 envelope when no session is present.
 */
export async function requireAuth(): Promise<AuthResult> {
  const supabase = profilesServerClient();
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
    // Auth row exists but no mirror row yet; the Auth & Identity agent
    // creates the mirror at sign-up. Treat as "complete your account"
    // rather than 401.
    return {
      ok: false,
      response: apiError('forbidden', 'Finish setting up your account before managing a profile.'),
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
 * Require a signed-in user who has companion mode enabled. Used by
 * every endpoint that writes companion-owned state.
 */
export async function requireCompanionMode(): Promise<AuthResult> {
  const result = await requireAuth();
  if (!result.ok) return result;
  if (!result.caller.profile.is_companion) {
    return {
      ok: false,
      response: apiError(
        'companion_mode_required',
        'Enable companion mode to manage your companion profile.',
      ),
    };
  }
  return result;
}
