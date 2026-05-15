import 'server-only';

// Server-side session helpers. Every server-rendered page or route
// handler that depends on identity should funnel through this module so
// authentication and authorisation stay consistent across the codebase.
//
// CORE PRODUCT RULE: server-side authority - never trust the client.
// These helpers always re-read the session from the Supabase cookie and
// re-query `public.users` for role/verification state.

import { redirect } from 'next/navigation';
import { authServerClient } from './db';
import type { UserRow } from '@/lib/types';

export interface SessionUser {
  /** Supabase auth user id (same as public.users.id). */
  id: string;
  email: string;
  /** True once Supabase Auth has confirmed the email address. */
  emailConfirmed: boolean;
  /** Public.users row. May be null on the brief window after sign-up
   *  before the mirror row is created. */
  profile: UserRow | null;
}

/**
 * Read the current session. Returns null when the user is signed out
 * or the cookie is missing / expired.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await authServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return null;
  }

  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', data.user.id)
    .maybeSingle();

  return {
    id: data.user.id,
    email: data.user.email ?? '',
    emailConfirmed: Boolean(data.user.email_confirmed_at),
    profile: (profile as UserRow | null) ?? null,
  };
}

/**
 * Require a signed-in user. Redirects to the login screen when no
 * session is present. Use from server components and route handlers
 * that should be gated.
 */
export async function requireSessionUser(redirectTo: string = '/login'): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    redirect(redirectTo);
  }
  return user;
}

/**
 * Require a signed-in user who has at least the requested mode enabled.
 *
 * Mirrors core product rule #5 (one account, two modes): a single user
 * row carries `is_seeker` and `is_companion` independently. The caller
 * specifies which mode the screen requires.
 */
export async function requireMode(
  mode: 'seeker' | 'companion',
  redirectTo: string = '/login',
): Promise<SessionUser> {
  const user = await requireSessionUser(redirectTo);
  if (!user.profile) {
    // Profile row hasn't been mirrored yet - the verification screen
    // will create it on demand.
    redirect('/verify');
  }
  const allowed = mode === 'seeker' ? user.profile.is_seeker : user.profile.is_companion;
  if (!allowed) {
    redirect('/mode');
  }
  return user;
}
