import 'server-only';

// Shared loader for a companion's public profile.
//
// Extracted so BOTH the GET /api/profiles/[id] route AND the
// /companions/[id] server page can run it directly, in-process, against
// a request-scoped (RLS) client. The page used to fetch its own API over
// HTTP — a full self-round-trip that re-ran auth (a second getUser) on
// top of the page's own. Calling this directly removes that round-trip
// and the duplicate auth entirely.
//
// Verification gating (core rule #10) is still enforced by RLS: an
// unverified / unknown profile is invisible, so the lookup returns null
// and callers respond 404 — existence is never leaked.

import type { LooseSupabaseClient } from '@/app/api/_lib';
import { toPublicCompanionProfileDTO, type PublicCompanionProfileDTO } from './types';
import type { AvailabilityRow, CompanionProfileRow, UserRow } from '@/lib/types';

export async function loadPublicCompanionProfile(
  supabase: LooseSupabaseClient,
  id: string,
): Promise<PublicCompanionProfileDTO | null> {
  const { data: profileRaw, error: profileErr } = await supabase
    .from('companion_profiles')
    .select('*')
    .eq('user_id', id)
    .maybeSingle();
  if (profileErr) {
    throw new Error('Could not load companion profile.');
  }
  if (!profileRaw) return null;

  const profile = profileRaw as CompanionProfileRow;

  const [userRes, availabilityRes] = await Promise.all([
    supabase.from('users').select('id, name').eq('id', id).maybeSingle(),
    supabase
      .from('availability')
      .select('*')
      .eq('companion_profile_id', profile.id)
      .order('day_or_date', { ascending: true }),
  ]);

  if (userRes.error || availabilityRes.error) {
    throw new Error('Could not load companion profile.');
  }
  if (!userRes.data) return null;

  return toPublicCompanionProfileDTO(
    profile,
    userRes.data as Pick<UserRow, 'id' | 'name'>,
    (availabilityRes.data ?? []) as AvailabilityRow[],
  );
}
