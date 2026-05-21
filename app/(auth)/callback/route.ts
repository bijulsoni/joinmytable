// Supabase Auth callback. The link in confirmation / password-reset
// emails points here with `?code=...` (PKCE) or `?token_hash=...`. We
// exchange that for a session cookie and then redirect to `next` (or a
// sensible default).
//
// Implementation notes:
//   - exchangeCodeForSession sets the cookie via the server client's
//     cookie adapter. The client constructor reads/writes through
//     Next's `cookies()` store, which only mutates outgoing cookies from
//     a route handler - so we MUST set them via NextResponse here.

import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') ?? '/welcome';

  const response = NextResponse.redirect(new URL(next, request.url));

  if (!code) {
    return NextResponse.redirect(new URL('/login?callback=missing', request.url));
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.redirect(new URL('/login?callback=env', request.url));
  }

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

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL('/login?callback=invalid', request.url));
  }

  return response;
}
