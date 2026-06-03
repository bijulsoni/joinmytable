import 'server-only';

// Server-side session helpers. Every server-rendered page or route
// handler that depends on identity should funnel through this module so
// authentication and authorisation stay consistent across the codebase.
//
// CORE PRODUCT RULE: server-side authority - never trust the client.
// These helpers always re-read the session from the Supabase cookie and
// re-query `public.users` for role/verification state.

import { cache } from 'react';
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
 *
 * Wrapped in React `cache()` so it runs AT MOST ONCE per request. This
 * matters a lot for performance: nearly every page resolves the session
 * twice — once in the page body and again inside <AppShell> — and
 * getUser() is a network round-trip to Supabase Auth (~60ms+) plus a
 * `users` select. The cache collapses those duplicate calls (and any
 * other getSessionUser/requireSessionUser callers in the same render)
 * into a single auth + profile fetch.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await authServerClient();

  // Use getSession() (local cookie decode, NO network) rather than
  // getUser() (a network round-trip to Supabase Auth, ~63ms). This is
  // safe because middleware.ts calls getUser() on every matched request
  // FIRST — that's our single server-side validation + token-refresh
  // point. By the time a page/route renders, the cookie has already been
  // validated and refreshed for this request, so re-validating over the
  // network here is pure duplicated latency on the critical path.
  const { data, error } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (error || !user) {
    return null;
  }

  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  // CRITICAL: a session whose user has no public.users mirror row is NOT
  // a real, signed-up account — so we treat it as signed out. This guards
  // two ghost-session cases that getSession() (local, unvalidated) would
  // otherwise wave through:
  //   1. A DELETED user whose JWT is still structurally valid + unexpired
  //      (e.g. an account removed server-side; their old cookie lingers).
  //   2. A half-created OAuth account whose mirror-row creation was rolled
  //      back at the invite gate, but whose session cookie was left set.
  // Both signup paths (email + OAuth) create the mirror row BEFORE a
  // usable session exists, so a genuine signed-in user always has one;
  // "session but no mirror" only ever means an invalid/ghost session.
  if (!profile) {
    return null;
  }

  return {
    id: user.id,
    email: user.email ?? '',
    emailConfirmed: Boolean(user.email_confirmed_at),
    profile: profile as UserRow,
  };
});

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
