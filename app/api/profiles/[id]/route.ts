// /api/profiles/[id] - public read of a companion profile by user_id.
//
//   GET - returns the verified companion's public view + availability.
//
// Verification gating (core product rule #10) is enforced by the
// `companion_profiles_select_verified` RLS policy: an unverified profile
// is invisible to the caller, so an `.eq('user_id', id)` lookup returns
// no rows and we respond 404 - we never leak existence.
//
// The caller must be authenticated; anonymous discovery is out of scope
// for this MVP (matches the rest of the app, which expects a signed-in user).

import { NextResponse } from 'next/server';
import { apiError, requireAuth, uuidSchema } from '@/app/api/_lib';
import { toPublicCompanionProfileDTO, type PublicCompanionProfileDTO } from '../_lib/types';
import type { AvailabilityRow, CompanionProfileRow, UserRow } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, ctx: RouteContext): Promise<NextResponse> {
  const { id: rawId } = await ctx.params;
  const idCheck = uuidSchema.safeParse(rawId);
  if (!idCheck.success) {
    return apiError('not_found', 'Companion profile not found.');
  }

  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { caller } = auth;
  const id = idCheck.data;

  // Load the profile first; if RLS hides it (unverified or unknown), the
  // public view is a 404 - we do not surface the related rows either.
  const { data: profileRaw, error: profileErr } = await caller.supabase
    .from('companion_profiles')
    .select('*')
    .eq('user_id', id)
    .maybeSingle();

  if (profileErr) {
    return apiError('internal_error', 'Could not load companion profile.');
  }
  if (!profileRaw) {
    return apiError('not_found', 'Companion profile not found.');
  }

  const profile = profileRaw as CompanionProfileRow;

  const [userRes, availabilityRes] = await Promise.all([
    caller.supabase.from('users').select('id, name').eq('id', id).maybeSingle(),
    caller.supabase
      .from('availability')
      .select('*')
      .eq('companion_profile_id', profile.id)
      .order('day_or_date', { ascending: true }),
  ]);

  if (userRes.error || availabilityRes.error) {
    return apiError('internal_error', 'Could not load companion profile.');
  }
  if (!userRes.data) {
    return apiError('not_found', 'Companion profile not found.');
  }

  const dto: PublicCompanionProfileDTO = toPublicCompanionProfileDTO(
    profile,
    userRes.data as Pick<UserRow, 'id' | 'name'>,
    (availabilityRes.data ?? []) as AvailabilityRow[],
  );
  return NextResponse.json({ profile: dto });
}
