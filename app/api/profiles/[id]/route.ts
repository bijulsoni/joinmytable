// /api/profiles/[id] - public read of a companion profile by user_id.
//
//   GET - returns the verified companion's public view + availability.
//
// Verification gating (core product rule #9) is enforced by the
// `companion_profiles_select_verified` RLS policy: an unverified profile
// is invisible to the caller, so an `.eq('user_id', id)` lookup returns
// no rows and we respond 404 - we never leak existence.
//
// The caller still needs to be authenticated; anonymous discovery is
// out of scope for this MVP (matches the rest of the app, which expects
// a signed-in user).

import { NextResponse } from 'next/server';
import { requireAuth } from '../_lib/auth';
import { apiError } from '../_lib/errors';
import { toPublicCompanionProfileDTO, type PublicCompanionProfileDTO } from '../_lib/types';
import { uuidSchema } from '../_lib/validators';
import type { AvailabilityRow, CompanionProfileRow, UserRow } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: { id: string };
}

export async function GET(_request: Request, { params }: RouteContext): Promise<NextResponse> {
  const idCheck = uuidSchema.safeParse(params.id);
  if (!idCheck.success) {
    return apiError('not_found', 'Companion profile not found.');
  }

  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { caller } = auth;
  const id = idCheck.data;

  const [profileRes, userRes, availabilityRes] = await Promise.all([
    caller.supabase.from('companion_profiles').select('*').eq('user_id', id).maybeSingle(),
    caller.supabase.from('users').select('display_name, avatar_path').eq('id', id).maybeSingle(),
    caller.supabase
      .from('availability')
      .select('*')
      .eq('companion_user_id', id)
      .order('day_of_week', { ascending: true })
      .order('start_time', { ascending: true }),
  ]);

  if (profileRes.error || userRes.error || availabilityRes.error) {
    return apiError('internal_error', 'Could not load companion profile.');
  }

  // RLS hides unverified profiles - missing row means "either does not
  // exist OR is not verified yet". Both look like 404 to a caller.
  if (!profileRes.data || !userRes.data) {
    return apiError('not_found', 'Companion profile not found.');
  }

  const dto: PublicCompanionProfileDTO = toPublicCompanionProfileDTO(
    profileRes.data as CompanionProfileRow,
    userRes.data as Pick<UserRow, 'display_name' | 'avatar_path'>,
    (availabilityRes.data ?? []) as AvailabilityRow[],
  );
  return NextResponse.json({ profile: dto });
}
