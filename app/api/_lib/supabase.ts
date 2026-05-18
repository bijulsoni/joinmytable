import 'server-only';

// Request-scoped Supabase adapter for Core API route handlers.
//
// The Phase-1 frozen `Database` type collapses some row inferences to
// `never` under the current `@supabase/postgrest-js` typings, so we cast
// to a loose shape at the boundary and re-narrow results into published
// Row types from `@/lib/types`. RLS remains the authoritative fence; the
// loose typing only side-steps a typegen issue.

import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export type LooseSupabaseClient = SupabaseClient<any, any, any, any>;

export async function apiServerClient(): Promise<LooseSupabaseClient> {
  return (await createSupabaseServerClient()) as unknown as LooseSupabaseClient;
}

import { createSupabaseAdminClient } from '@/lib/supabase/server';

/**
 * Loose-typed admin client for service-role inserts/updates (bookings,
 * payments, system messages). The strict typegen on the frozen Database
 * type collapses some inserts to `never`; we re-narrow inputs at the
 * boundary instead. RLS is not in play because the admin client bypasses
 * it; callers must enforce auth/authorization in code.
 */
export function apiAdminClient(): LooseSupabaseClient {
  return createSupabaseAdminClient() as unknown as LooseSupabaseClient;
}
