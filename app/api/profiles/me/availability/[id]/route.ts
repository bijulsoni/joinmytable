// /api/profiles/me/availability/[id] - per-window update / delete.
//
//   PUT    - patch a window the caller owns
//   DELETE - remove a window the caller owns
//
// Ownership is enforced both in the WHERE clause (companion_profile_id =
// caller's profile id) AND by RLS (`availability_update_self` /
// `availability_delete_self`). Mismatched ids return 404 (not 403) so
// callers cannot probe other users' windows.

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { apiError, parseJsonBody, requireCompanionMode, uuidSchema } from '@/app/api/_lib';
import { toAvailabilityDTO } from '../../../_lib/types';
import { availabilityUpdateSchema } from '../../../_lib/validators';
import type { AvailabilityRow, CompanionProfileRow } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function loadProfileId(
  supabase: Awaited<ReturnType<typeof import('@/app/api/_lib').apiServerClient>>,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('companion_profiles')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) return null;
  return (data as Pick<CompanionProfileRow, 'id'>).id;
}

export async function PUT(request: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const { id: rawId } = await ctx.params;
  const idCheck = uuidSchema.safeParse(rawId);
  if (!idCheck.success) {
    return apiError('not_found', 'Availability window not found.');
  }

  const auth = await requireCompanionMode();
  if (!auth.ok) return auth.response;
  const { caller } = auth;

  const parsed = await parseJsonBody(request, availabilityUpdateSchema);
  if (!parsed.ok) return parsed.response;
  const input = parsed.data;

  const profileId = await loadProfileId(caller.supabase, caller.userId);
  if (!profileId) {
    return apiError('not_found', 'Availability window not found.');
  }

  const { data, error } = await caller.supabase
    .from('availability')
    .update(input)
    .eq('id', idCheck.data)
    .eq('companion_profile_id', profileId)
    .select('*')
    .maybeSingle();
  if (error) {
    return apiError('internal_error', error.message || 'Could not update availability window.');
  }
  if (!data) {
    return apiError('not_found', 'Availability window not found.');
  }
  return NextResponse.json({
    availability: toAvailabilityDTO(data as AvailabilityRow),
  });
}

export async function DELETE(_request: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const { id: rawId } = await ctx.params;
  const idCheck = uuidSchema.safeParse(rawId);
  if (!idCheck.success) {
    return apiError('not_found', 'Availability window not found.');
  }

  const auth = await requireCompanionMode();
  if (!auth.ok) return auth.response;
  const { caller } = auth;

  const profileId = await loadProfileId(caller.supabase, caller.userId);
  if (!profileId) {
    return apiError('not_found', 'Availability window not found.');
  }

  // Return the deleted row so we can distinguish 404 from a successful
  // delete without an extra round-trip.
  const { data, error } = await caller.supabase
    .from('availability')
    .delete()
    .eq('id', idCheck.data)
    .eq('companion_profile_id', profileId)
    .select('id')
    .maybeSingle();
  if (error) {
    return apiError('internal_error', error.message || 'Could not delete availability window.');
  }
  if (!data) {
    return apiError('not_found', 'Availability window not found.');
  }
  return new NextResponse(null, { status: 204 });
}
