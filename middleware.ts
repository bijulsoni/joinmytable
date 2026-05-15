// Next.js middleware: refresh the Supabase auth session cookie on every
// request so server components see a fresh user. Without this, the
// auth cookie is only rewritten on the few routes that touch it
// explicitly and server-rendered pages can drift.
//
// Owner: Auth & Identity agent.

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request: { headers: request.headers } });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    // Foundations may not yet have provisioned env vars locally; do not
    // hard-fail the request - rendering will fall through to whatever
    // unauthenticated path the page exposes.
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        request.cookies.set({ name, value, ...options });
        response.cookies.set({ name, value, ...options });
      },
      remove(name: string, options: CookieOptions) {
        request.cookies.set({ name, value: '', ...options });
        response.cookies.set({ name, value: '', ...options });
      },
    },
  });

  // Touching getUser() forces a session refresh + cookie rewrite when
  // the access token is close to expiry.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  // Skip static + image assets and the Next.js internals so the middleware
  // only runs on real navigations and route handlers.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
