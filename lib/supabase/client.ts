'use client';

// Supabase client for browser components (Client Components, "use client").
//
// Reads only the NEXT_PUBLIC_* env vars - never the service-role key.
// Use this from the Frontend agent's client components for:
//   - the auth session
//   - the Realtime chat subscription

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/lib/types';

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required public env var: ${name}. See .env.example.`,
    );
  }
  return value;
}

export function createSupabaseBrowserClient() {
  return createBrowserClient<Database>(
    getEnv('NEXT_PUBLIC_SUPABASE_URL'),
    getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  );
}
