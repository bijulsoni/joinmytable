// Supabase Auth callback.
//
// Three flows land here, distinguished by whether a public.users mirror
// row already exists for the authenticated user:
//
//   1. Email confirmation / password reset — the email/password sign-up
//      action already created the mirror row, so the row EXISTS. We just
//      honor `next` (e.g. /welcome, /reset-password). Unchanged behavior.
//
//   2. Returning OAuth user (Google) — mirror row EXISTS from their first
//      visit. We route them to their home path.
//
//   3. Brand-new OAuth user — NO mirror row yet. This is the only path
//      that can create an account without going through the email
//      sign-up form, so it MUST enforce the private-beta invite gate
//      (a beta invariant). We preflight + claim the invite, create the
//      mirror row, and on ANY failure roll the auth user back so a
//      half-created account can't slip past the gate.
//
// Invite delivery: the "Continue with Google" button drops the code in a
// short-lived `konnly_invite` cookie BEFORE redirecting to Google, and
// also appends ?invite= as a belt-and-suspenders fallback. We read the
// cookie first because Supabase does not reliably preserve extra query
// params across the provider round-trip.
//
// Cookie handling: exchangeCodeForSession (and signOut) write session
// cookies through the SSR client's adapter. We collect every such write
// and replay it onto whatever redirect response we ultimately return —
// otherwise a fresh NextResponse.redirect would silently drop the
// session and the user wouldn't actually be logged in.

import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createSupabaseAdminClient } from '@/lib/supabase/server';
import { createUserMirrorRow } from '@/lib/auth/profile';
import { preflightInvite, claimInvite, releaseInvite } from '@/lib/auth/invite';
import { homePathForUser } from '@/lib/auth/home-path';
import { logger } from '@/lib/logger';

const log = logger.child({ module: 'auth.callback' });

const INVITE_COOKIE = 'konnly_invite';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next');

  // Invite from the cookie (reliable) first, query param (fallback) second.
  const inviteFromCookie = (request.cookies.get(INVITE_COOKIE)?.value ?? '').trim().toUpperCase();
  const inviteFromParam = (url.searchParams.get('invite') ?? '').trim().toUpperCase();
  const invite = inviteFromCookie || inviteFromParam;

  // Every cookie the Supabase adapter wants to set during this request.
  // Replayed onto the final redirect so the session actually persists.
  const pendingCookies: { name: string; value: string; options: CookieOptions }[] = [];

  // Build a redirect that carries the session cookies + clears the
  // one-shot invite cookie.
  const finish = (path: string): NextResponse => {
    const res = NextResponse.redirect(new URL(path, request.url));
    for (const c of pendingCookies) {
      res.cookies.set({ name: c.name, value: c.value, ...c.options });
    }
    res.cookies.set({ name: INVITE_COOKIE, value: '', path: '/', maxAge: 0 });
    return res;
  };

  if (!code) {
    return finish('/login?callback=missing');
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return finish('/login?callback=env');
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        pendingCookies.push({ name, value, options });
      },
      remove(name: string, options: CookieOptions) {
        pendingCookies.push({ name, value: '', options });
      },
    },
  });

  const { data: exchanged, error: exchangeError } =
    await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError || !exchanged.user) {
    return finish('/login?callback=invalid');
  }

  const authUser = exchanged.user;
  const admin = createSupabaseAdminClient();

  // Mirror row existence separates an existing account (flows 1 & 2)
  // from a brand-new OAuth user (flow 3).
  const { data: existingMirror } = await admin
    .from('users')
    .select('onboarded_at, is_seeker, is_companion')
    .eq('id', authUser.id)
    .maybeSingle();

  // Tear down the just-authenticated session + auth user so a gate
  // failure leaves nothing behind. signOut pushes cookie-clears into
  // pendingCookies, which finish() then applies.
  const rollbackAuthUser = async (reason: string) => {
    log.warn({ userId: authUser.id, reason }, 'oauth invite gate: rolling back new auth user');
    try {
      // scope:'local' clears the just-set session cookie WITHOUT a network
      // round-trip — a global sign-out can throw before clearing locally,
      // which is exactly how a rejected signup was leaving a live session.
      await supabase.auth.signOut({ scope: 'local' });
    } catch {
      // still delete the user below
    }
    try {
      await admin.auth.admin.deleteUser(authUser.id);
    } catch (err) {
      log.error(
        { err: err instanceof Error ? err.message : String(err), userId: authUser.id },
        'oauth rollback deleteUser threw',
      );
    }
  };

  if (existingMirror) {
    // Flows 1 & 2 — existing account. Honor an explicit `next` (password
    // reset, email confirmation → /welcome); otherwise route home.
    const mirror = existingMirror as {
      onboarded_at: string | null;
      is_seeker: boolean;
      is_companion: boolean;
    };
    return finish(next ?? homePathForUser(mirror));
  }

  // Flow 3 — brand-new OAuth user. Enforce the invite gate.
  if (!invite) {
    await rollbackAuthUser('missing invite');
    return finish('/sign-up?oauth=invite_required');
  }

  const preflight = await preflightInvite(invite);
  if (!preflight.ok) {
    await rollbackAuthUser('invalid invite');
    return finish('/sign-up?oauth=invite_invalid');
  }

  const claimed = await claimInvite(preflight.row, authUser.id);
  if (!claimed) {
    await rollbackAuthUser('invite claim lost race');
    return finish('/sign-up?oauth=invite_taken');
  }

  // Name from the OAuth identity, falling back to the email local-part.
  const meta = (authUser.user_metadata ?? {}) as Record<string, unknown>;
  const metaName =
    (typeof meta.full_name === 'string' && meta.full_name) ||
    (typeof meta.name === 'string' && meta.name) ||
    '';
  const email = authUser.email ?? '';
  const name = (metaName || email.split('@')[0] || 'New member').slice(0, 80);

  const mirror = await createUserMirrorRow({
    authUserId: authUser.id,
    email,
    name,
    isSeeker: true,
    isCompanion: true,
  });
  if (!mirror.ok) {
    log.error({ err: mirror.error, userId: authUser.id }, 'oauth mirror row insert failed');
    await releaseInvite(preflight.row, authUser.id);
    await rollbackAuthUser('mirror row insert failed');
    return finish('/sign-up?oauth=mirror_failed');
  }

  // New account created + session preserved — into onboarding.
  return finish('/welcome');
}
