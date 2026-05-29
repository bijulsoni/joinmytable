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
//      (a beta invariant). The invite code rides in on `?invite=` (set
//      by the "Continue with Google" button). We preflight + claim it,
//      create the mirror row, and on ANY failure roll the auth user back
//      so a half-created account can't slip past the gate.
//
// Implementation note: exchangeCodeForSession sets the session cookie via
// the SSR client's cookie adapter, which only mutates outgoing cookies
// from a route handler — so we set them on the NextResponse here.

import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createSupabaseAdminClient } from '@/lib/supabase/server';
import { createUserMirrorRow } from '@/lib/auth/profile';
import { preflightInvite, claimInvite, releaseInvite } from '@/lib/auth/invite';
import { homePathForUser } from '@/lib/auth/home-path';
import { logger } from '@/lib/logger';

const log = logger.child({ module: 'auth.callback' });

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next');
  const invite = (url.searchParams.get('invite') ?? '').trim().toUpperCase();

  if (!code) {
    return NextResponse.redirect(new URL('/login?callback=missing', request.url));
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.redirect(new URL('/login?callback=env', request.url));
  }

  // Pre-build a response so the SSR client can write the session cookie
  // onto it. We override the redirect location at the end.
  const response = NextResponse.redirect(new URL(next ?? '/welcome', request.url));
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        response.cookies.set({ name, value, ...options });
      },
      remove(name: string, options: CookieOptions) {
        response.cookies.set({ name, value: '', ...options });
      },
    },
  });

  const { data: exchanged, error: exchangeError } =
    await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError || !exchanged.user) {
    return NextResponse.redirect(new URL('/login?callback=invalid', request.url));
  }

  const authUser = exchanged.user;
  const admin = createSupabaseAdminClient();

  // Does a mirror row already exist? This is what separates an existing
  // account (flows 1 & 2) from a brand-new OAuth user (flow 3).
  const { data: existingMirror } = await admin
    .from('users')
    .select('onboarded_at, is_seeker, is_companion')
    .eq('id', authUser.id)
    .maybeSingle();

  // Helper: tear down the just-authenticated session + auth user so a
  // gate failure leaves nothing behind.
  const rollbackAuthUser = async (reason: string) => {
    log.warn({ userId: authUser.id, reason }, 'oauth invite gate: rolling back new auth user');
    try {
      await supabase.auth.signOut();
    } catch {
      // ignored — we still delete the user below
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
    const dest = next ?? homePathForUser(mirror);
    return NextResponse.redirect(new URL(dest, request.url));
  }

  // Flow 3 — brand-new OAuth user. Enforce the invite gate.
  if (!invite) {
    await rollbackAuthUser('missing invite');
    return NextResponse.redirect(new URL('/sign-up?oauth=invite_required', request.url));
  }

  const preflight = await preflightInvite(invite);
  if (!preflight.ok) {
    await rollbackAuthUser('invalid invite');
    return NextResponse.redirect(new URL('/sign-up?oauth=invite_invalid', request.url));
  }

  const claimed = await claimInvite(preflight.row, authUser.id);
  if (!claimed) {
    await rollbackAuthUser('invite claim lost race');
    return NextResponse.redirect(new URL('/sign-up?oauth=invite_taken', request.url));
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
    return NextResponse.redirect(new URL('/sign-up?oauth=mirror_failed', request.url));
  }

  // New account created — send them through onboarding.
  return NextResponse.redirect(new URL('/welcome', request.url));
}
