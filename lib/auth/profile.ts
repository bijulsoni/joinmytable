import 'server-only';

// Server-side helpers that own the `public.users` mirror row and the
// one-account-two-modes flags. Sign-up creates the mirror row via the
// admin client (the new auth user has no session yet at insert time).
// Subsequent mode updates run as the user (RLS update-self policy).

import { authAdminClient, authServerClient } from './db';
import type { UserRow, UserUpdate } from '@/lib/types';

export interface CreateMirrorRowInput {
  authUserId: string;
  email: string;
  displayName: string;
  isSeeker: boolean;
  isCompanion: boolean;
  acceptedGuidelines: boolean;
}

/**
 * Insert the public.users row that mirrors a freshly created auth.users
 * row. Uses the service-role admin client because the user may not
 * have a session yet (e.g. when email confirmation is required).
 *
 * Idempotent on (id) - safe to retry.
 */
export async function createUserMirrorRow(
  input: CreateMirrorRowInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = authAdminClient();

  // Enforce the schema constraint client-side too so we return a clean
  // error instead of leaking the Postgres message.
  if (!input.isSeeker && !input.isCompanion) {
    return { ok: false, error: 'Pick at least one mode.' };
  }
  const displayName = input.displayName.trim();
  if (displayName.length < 1 || displayName.length > 80) {
    return { ok: false, error: 'Display name must be 1-80 characters.' };
  }

  const { error } = await admin.from('users').upsert(
    {
      id: input.authUserId,
      email: input.email,
      display_name: displayName,
      is_seeker: input.isSeeker,
      is_companion: input.isCompanion,
      guidelines_accepted_at: input.acceptedGuidelines ? new Date().toISOString() : null,
    } satisfies Partial<UserRow>,
    { onConflict: 'id' },
  );

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/**
 * Toggle one of the mode flags for the signed-in user. Runs through the
 * request-scoped client so RLS confirms the caller may only update their
 * own row. Refuses to clear both flags (mirrors the
 * `users_at_least_one_mode` check constraint).
 */
export async function updateUserModes(input: {
  isSeeker: boolean;
  isCompanion: boolean;
}): Promise<{ ok: true; profile: UserRow } | { ok: false; error: string }> {
  if (!input.isSeeker && !input.isCompanion) {
    return { ok: false, error: 'You must keep at least one mode enabled.' };
  }

  const supabase = await authServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return { ok: false, error: 'Not signed in.' };
  }

  const update: UserUpdate = {
    is_seeker: input.isSeeker,
    is_companion: input.isCompanion,
  };
  const { data, error } = await supabase
    .from('users')
    .update(update)
    .eq('id', auth.user.id)
    .select('*')
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? 'Update failed.' };
  }
  return { ok: true, profile: data as UserRow };
}

/**
 * Record acceptance of the community guidelines. Trust & Safety owns
 * the guidelines copy; this is the timestamp side-effect that gates
 * marketplace participation.
 */
export async function acceptGuidelines(): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await authServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: 'Not signed in.' };

  const update: UserUpdate = {
    guidelines_accepted_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('users').update(update).eq('id', auth.user.id);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
