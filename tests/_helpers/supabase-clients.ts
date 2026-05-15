// Supabase client factories scoped to the test process.
//
// We deliberately bypass `@/lib/supabase/server` (which is `server-only`
// and reads cookies via `next/headers`). Tests build their own clients:
//
//   - admin    : service role; bypasses RLS. Used for setup / teardown.
//   - anon     : anonymous; verifies that anonymous reads are blocked.
//   - asUser   : signed-in as a specific user; carries that user's JWT
//                so RLS evaluates `auth.uid()` against the real id.
//
// The helpers here are framework-only — no business logic — so they can
// be reused by any future suite (bookings, messaging, etc.).

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requireTestSupabaseEnv, type TestSupabaseEnv } from './env';

export type AnyClient = SupabaseClient<any, any, any, any>;

interface BaseClientOptions {
  env?: TestSupabaseEnv;
}

export function adminClient(options: BaseClientOptions = {}): AnyClient {
  const env = options.env ?? requireTestSupabaseEnv();
  return createClient(env.url, env.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function anonClient(options: BaseClientOptions = {}): AnyClient {
  const env = options.env ?? requireTestSupabaseEnv();
  return createClient(env.url, env.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Build an authenticated client carrying the supplied access token. The
 * resulting client makes PostgREST requests as that user — RLS will see
 * `auth.uid()` = the user's id.
 */
export function asUserClient(accessToken: string, options: BaseClientOptions = {}): AnyClient {
  const env = options.env ?? requireTestSupabaseEnv();
  return createClient(env.url, env.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
