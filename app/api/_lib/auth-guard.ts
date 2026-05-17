import 'server-only';

// Auth/authorization guards for Core API route handlers.
//
// Route-handler version of `lib/auth/session.ts` helpers that return a
// JSON 401/409 response instead of redirecting. Every gate re-reads the
// session from the Supabase cookie and re-queries `public.users` for
// role + verification state (server-side authority).
//
// `requireAuth` enforces "signed-in user with a mirrored users row".
// `requireCompanionMode` / `requireSeekerMode` additionally enforce core
// product rule #6 (one account, two modes) at the API boundary.

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

export async function requireSeekerMode(): Promise<AuthResult> {
  const result = await requireAuth();
  if (!result.ok) return result;
  if (!result.caller.profile.is_seeker) {
    return {
      ok: false,
      response: apiError('seeker_mode_required', 'Enable seeker mode to continue.'),
    };
  }
  return result;
}
