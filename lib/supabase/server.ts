import 'server-only';

// Supabase clients for the server side (Server Components, route handlers,
// server actions). Cookie-bound so RLS sees the signed-in user.
//
// CORE PRODUCT RULE: server-side authority. Every API route should call
// `createSupabaseServerClient` and authorize against the resulting user.

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { supabaseAnonKey, supabaseServiceRoleKey, supabaseUrl } from './env';
import type { Database } from '@/lib/types';

/**
 * Request-scoped client. Reads the auth cookie, so queries run as the
 * signed-in user and RLS applies. Use this in API routes and Server
 * Components for any user-bound work.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value, ...options });
        } catch {
          // Setting cookies from a Server Component is not allowed.
          // The session refresh middleware (or a route handler) will
          // pick this up on the next request.
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value: '', ...options });
        } catch {
          // See note in set() above.
        }
      },
    },
  });
}

/**
 * Admin client - uses the service-role key and BYPASSES RLS. Reserve
 * for system tasks (Stripe webhook handlers, scheduled jobs, admin
 * tooling). Never expose its results directly to an unauthenticated
 * request.
 */
export function createSupabaseAdminClient() {
  return createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
