import 'server-only';

// Local supabase-client adapters for the auth module.
//
// The Phase-1 frozen `Database` type in lib/types/database.ts predates
// supabase-js 2.105's tightened `GenericSchema` constraints; with the
// current postgrest-js, intersecting `Tables` with the `Views:
// Record<string, never>` shape collapses every table row to `never`.
// Until Foundations/Database regenerates that type via
// `supabase gen types typescript`, the auth module reaches into the
// supabase client via the typed adapters below. Each callsite still
// narrows results into the published `Row` types from `lib/types`, so
// the documented contract is preserved at the boundary.

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from '@/lib/supabase/server';

export type LooseSupabaseClient = SupabaseClient<any, any, any, any>;

export function authServerClient(): LooseSupabaseClient {
  return createSupabaseServerClient() as unknown as LooseSupabaseClient;
}

export function authAdminClient(): LooseSupabaseClient {
  return createSupabaseAdminClient() as unknown as LooseSupabaseClient;
}
