// Test-environment detection.
//
// Unit tests run in any environment. Integration and RLS suites need a
// real Supabase project we can write to; they self-skip when the env
// vars are missing so the default `npm test` (CI merge gate) stays
// deterministic without a test database.
//
// To run the integration / RLS suites locally point the vars below at a
// disposable Supabase project (NOT staging or production):
//
//   TEST_SUPABASE_URL=https://<ref>.supabase.co
//   TEST_SUPABASE_ANON_KEY=...
//   TEST_SUPABASE_SERVICE_ROLE_KEY=...
//
// Then `npm run test:integration` and `npm run test:rls`.
//
// The vars are deliberately separate from the application's
// NEXT_PUBLIC_SUPABASE_URL so a misconfigured shell can never point a
// test suite at the dev Supabase project the rest of the team is using.

export interface TestSupabaseEnv {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
}

export function readTestSupabaseEnv(): TestSupabaseEnv | null {
  const url = process.env.TEST_SUPABASE_URL;
  const anonKey = process.env.TEST_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceRoleKey) return null;
  return { url, anonKey, serviceRoleKey };
}

/**
 * `describe.skipIf(noTestSupabaseEnv())` — skips the suite at definition
 * time so a missing TEST_SUPABASE_* env never crashes the runner.
 */
export function noTestSupabaseEnv(): boolean {
  return readTestSupabaseEnv() === null;
}

/**
 * Same idea but throws — call from a `beforeAll` if you want to FAIL
 * loudly when an integration job is misconfigured.
 */
export function requireTestSupabaseEnv(): TestSupabaseEnv {
  const env = readTestSupabaseEnv();
  if (!env) {
    throw new Error(
      'Integration tests require TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY, and TEST_SUPABASE_SERVICE_ROLE_KEY to be set. See tests/_helpers/env.ts.',
    );
  }
  return env;
}
