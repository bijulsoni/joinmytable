'use client';

// Supabase client for browser components (Client Components, "use client").
//
// Reads only the NEXT_PUBLIC_* env vars - never the service-role key.
// Use this from the Frontend agent's client components for:
//   - the auth session
//   - the Realtime chat subscription

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/lib/types';

function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required public env var: ${name}. See .env.example.`);
  }
  return value;
}

export function createSupabaseBrowserClient() {
  return createBrowserClient<Database>(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL),
    requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  );
}
