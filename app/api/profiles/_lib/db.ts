import 'server-only';

// Local Supabase adapter for the profiles API module.
//
// Mirrors the pattern in `lib/auth/db.ts`: the Phase-1 frozen `Database`
// type produces collapsed-to-`never` row inference under the current
// `@supabase/postgrest-js`, so each route casts the request-scoped client
// to a loose shape and re-narrows results into published Row types from
// `@/lib/types` at the boundary. RLS remains the authoritative fence;
// the loose typing here only side-steps a typegen issue.

import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export type LooseSupabaseClient = SupabaseClient<any, any, any, any>;

export function profilesServerClient(): LooseSupabaseClient {
  return createSupabaseServerClient() as unknown as LooseSupabaseClient;
}
