// Public entry point for the auth module.
//
// Server-side helpers (session, profile, verification, storage) are
// exported from their own paths so they can keep their `server-only`
// import. Importing them here would pull `server-only` into any client
// component that touches this file.
//
// Client code: `import { AuthProvider, useAuth } from '@/lib/auth'`.
// Server code: `import { ... } from '@/lib/auth/session'` etc.

export { AuthProvider, useAuth } from './context';
