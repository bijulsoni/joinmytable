// Public entry for the Supabase module.
//
// - Browser client lives in ./client (named export).
// - Server clients live in ./server and import 'server-only' to keep
//   the service-role key out of the client bundle. Import them
//   directly from '@/lib/supabase/server'.

export { createSupabaseBrowserClient } from './client';
