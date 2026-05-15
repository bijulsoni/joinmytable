// /api/profiles/me/availability - the signed-in companion's recurring
// availability windows.
//
//   GET  - list the caller's availability windows
//   POST - create a new window
//
// Per-window update / delete lives at `[id]/route.ts`.

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { requireCompanionMode } from '../../_lib/auth';
import { apiError } from '../../_lib/errors';
import { parseJsonBody } from '../../_lib/parse';
import { toAvailabilityDTO } from '../../_lib/types';
import { availabilityCreateSchema } from '../../_lib/validators';
import type { AvailabilityRow } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const auth = await requireCompanionMode();
  if (!auth.ok) return auth.response;
  const { caller } = auth;

  const { data, error } = await caller.supabase
    .from('availability')
    .select('*')
    .eq('companion_user_id', caller.userId)
    .order('day_of_week', { ascending: true })
    .order('start_time', { ascending: true });

  if (error) {
    return apiError('internal_error', 'Could not load availability.');
  }
  return NextResponse.json({
    availability: ((data ?? []) as AvailabilityRow[]).map(toAvailabilityDTO),
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireCompanionMode();
  if (!auth.ok) return auth.response;
  const { caller } = auth;

  const parsed = await parseJsonBody(request, availabilityCreateSchema);
  if (!parsed.ok) return parsed.response;
  const input = parsed.data;

  // `availability.companion_user_id` FKs to companion_profiles.user_id.
  // If the profile row does not exist yet, Postgres returns a foreign-key
  // violation; surface it as 409 so the Frontend can prompt the user to
  // set up the profile first.
  const { data: profile, error: profileErr } = await caller.supabase
    .from('companion_profiles')
    .select('user_id')
    .eq('user_id', caller.userId)
    .maybeSingle();
  if (profileErr) {
    return apiError('internal_error', 'Could not load companion profile.');
  }
  if (!profile) {
    return apiError('conflict', 'Set up your companion profile before adding availability.');
  }

  const insertPayload = {
    companion_user_id: caller.userId,
    day_of_week: input.day_of_week,
    start_time: input.start_time,
    end_time: input.end_time,
    meal_type: input.meal_type,
    timezone: input.timezone,
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
