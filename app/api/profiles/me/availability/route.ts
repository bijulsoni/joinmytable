// /api/profiles/me/availability - the signed-in companion's availability windows.
//
//   GET  - list the caller's availability windows
//   POST - create a new window
//
// Per-window update / delete lives at `[id]/route.ts`.
//
// Note: `availability.companion_profile_id` references
// `companion_profiles.id` (not users.id). The route resolves the
// caller's profile id first; absence -> 409 "set up profile first".

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { apiError, parseJsonBody, requireAuth } from '@/app/api/_lib';
import { toAvailabilityDTO } from '../../_lib/types';
import { availabilityCreateSchema } from '../../_lib/validators';
import type { AvailabilityRow, CompanionProfileRow } from '@/lib/types';

export const dynamic = 'force-dynamic';

async function loadProfileId(
  supabase: Awaited<ReturnType<typeof import('@/app/api/_lib').apiServerClient>>,
  userId: string,
): Promise<
  { ok: true; profileId: string } | { ok: false; status: 'missing' | 'error'; message?: string }
> {
  const { data, error } = await supabase
    .from('companion_profiles')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return { ok: false, status: 'error', message: error.message };
  if (!data) return { ok: false, status: 'missing' };
  return { ok: true, profileId: (data as Pick<CompanionProfileRow, 'id'>).id };
}

export async function GET(): Promise<NextResponse> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { caller } = auth;

  const profile = await loadProfileId(caller.supabase, caller.userId);
  if (!profile.ok) {
    if (profile.status === 'missing') {
      // No profile yet = no availability to list. Return empty rather
      // than 409 so the Frontend can render the "setup" state cleanly.
      return NextResponse.json({ availability: [] });
    }
    return apiError('internal_error', 'Could not load companion profile.');
  }

  const { data, error } = await caller.supabase
    .from('availability')
    .select('*')
    .eq('companion_profile_id', profile.profileId)
    .order('day_or_date', { ascending: true });

  if (error) {
    return apiError('internal_error', 'Could not load availability.');
  }
  return NextResponse.json({
    availability: ((data ?? []) as AvailabilityRow[]).map(toAvailabilityDTO),
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { caller } = auth;

  const parsed = await parseJsonBody(request, availabilityCreateSchema);
  if (!parsed.ok) return parsed.response;
  const input = parsed.data;

  const profile = await loadProfileId(caller.supabase, caller.userId);
  if (!profile.ok) {
    if (profile.status === 'missing') {
      return apiError('conflict', 'Set up your companion profile before adding availability.');
    }
    return apiError('internal_error', 'Could not load companion profile.');
  }

  const insertPayload = {
    companion_profile_id: profile.profileId,
    day_or_date: input.day_or_date,
    time_range: input.time_range,
    activity_types: input.activity_types,
  };

  const { data, error } = await caller.supabase
    .from('availability')
    .insert(insertPayload)
    .select('*')
    .single();
  if (error || !data) {
    return apiError('internal_error', error?.message ?? 'Could not create availability window.');
  }
  return NextResponse.json(
    { availability: toAvailabilityDTO(data as AvailabilityRow) },
    { status: 201 },
  );
}
