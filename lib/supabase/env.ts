// Centralised access to Supabase env vars.
//
// CORE PRODUCT RULE compliance:
// - The service-role key is server-only. It MUST NOT leak to the client
//   bundle. This module exports it from a server-only path that throws
//   if imported in the browser.

import 'server-only';

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing required env var: ${name}. See .env.example and set it in your local environment.`,
    );
  }
  return value;
}

export const supabaseUrl = required(
  'NEXT_PUBLIC_SUPABASE_URL',
  process.env.NEXT_PUBLIC_SUPABASE_URL,
);

export const supabaseAnonKey = required(
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

/**
 * Service-role key. NEVER use in client components or pass to the
 * browser. Use only in route handlers, server actions, or background
 * jobs that must bypass RLS for system tasks.
 */
export const supabaseServiceRoleKey = required(
  'SUPABASE_SERVICE_ROLE_KEY',
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);
