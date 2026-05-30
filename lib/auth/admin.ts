import 'server-only';

// Admin gate for the /admin console.
//
// Server-side authority: re-reads the session + the is_admin flag from
// public.users on every call. is_admin is never user-writable (set only
// via scripts/db/grant-admin.mjs), so this is the single source of truth
// for "may this person use the admin console."
//
// Non-admins are bounced to /discover rather than /login — a signed-in
// normal user poking at /admin shouldn't be asked to re-authenticate,
// just sent home.

import { redirect } from 'next/navigation';
import { getSessionUser, type SessionUser } from './session';

export async function requireAdmin(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    redirect('/login?next=/admin');
  }
  if (!user.profile?.is_admin) {
    redirect('/discover');
  }
  return user;
}

/** Non-redirecting check — for conditionally rendering the admin nav link. */
export async function isAdmin(): Promise<boolean> {
  const user = await getSessionUser();
  return Boolean(user?.profile?.is_admin);
}
