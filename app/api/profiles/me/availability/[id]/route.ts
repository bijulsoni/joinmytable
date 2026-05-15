// /api/profiles/me/availability/[id] - per-window update / delete.
//
//   PUT    - patch a window the caller owns
//   DELETE - remove a window the caller owns
//
// Ownership is enforced both in the WHERE clause AND by RLS
// (`availability_update_self` / `availability_delete_self`). Mismatched
// ids return 404, not 403, so callers can't probe other users' windows.

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { requireCompanionMode } from '../../../_lib/auth';
import { apiError } from '../../../_lib/errors';
import { parseJsonBody } from '../../../_lib/parse';
import { toAvailabilityDTO } from '../../../_lib/types';
import { availabilityUpdateSchema, uuidSchema } from '../../../_lib/validators';
import type { AvailabilityRow } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: { id: string };
}

export async function PUT(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const idCheck = uuidSchema.safeParse(params.id);
  if (!idCheck.success) {
    return apiError('not_found', 'Availability window not found.');
  }

  const auth = await requireCompanionMode();
  if (!auth.ok) return auth.response;
  const { caller } = auth;

  const parsed = await parseJsonBody(request, availabilityUpdateSchema);
  if (!parsed.ok) return parsed.response;
  const input = parsed.data;

  // If the caller only sent partial fields (e.g. only start_time), make
  // sure the window remains valid after the patch by joining current row
  // values with the patch and re-checking ordering.
  if ((input.start_time !== undefined) !== (input.end_time !== undefined)) {
    const { data: current, error: readErr } = await caller.supabase
      .from('availability')
      .select('start_time, end_time')
      .eq('id', idCheck.data)
      .eq('companion_user_id', caller.userId)
      .maybeSingle();
    if (readErr) {
      return apiError('internal_error', 'Could not load availability window.');
    }
    if (!current) {
      return apiError('not_found', 'Availability window not found.');
    }
    const next = {
      start_time: input.start_time ?? (current as AvailabilityRow).start_time,
      end_time: input.end_time ?? (current as AvailabilityRow).end_time,
    };
    if (next.end_time <= next.start_time) {
      return apiError('invalid_input', 'end_time must be after start_time.');
    }
  }

  const { data, error } = await caller.supabase
    .from('availability')
    .update(input)
    .eq('id', idCheck.data)
    .eq('companion_user_id', caller.userId)
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

export async function DELETE(
  _request: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const idCheck = uuidSchema.safeParse(params.id);
  if (!idCheck.success) {
    return apiError('not_found', 'Availability window not found.');
  }

  const auth = await requireCompanionMode();
  if (!auth.ok) return auth.response;
  const { caller } = auth;

  // Return the deleted row so we can distinguish 404 from a successful
  // delete without an extra round-trip.
  const { data, error } = await caller.supabase
    .from('availability')
    .delete()
    .eq('id', idCheck.data)
    .eq('companion_user_id', caller.userId)
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
