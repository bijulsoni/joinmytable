import 'server-only';

// GET /api/bookings/[id]
//
// Single-booking detail. RLS gates visibility to participants
// (is_booking_participant). Returns the booking + escrow status +
// counterpart name; the chat UI is a separate endpoint.

import { NextResponse } from 'next/server';
import { apiError, requireAuth } from '@/app/api/_lib';
import { uuidSchema } from '@/app/api/_lib/validators';
import type { BookingRow } from '../_lib/types';
import type { EscrowStatus } from '@/lib/types';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;
  const { caller } = guard;

  const { id: rawId } = await ctx.params;
  const idResult = uuidSchema.safeParse(rawId);
  if (!idResult.success) {
    return apiError('invalid_input', 'Invalid booking id.');
  }
  const id = idResult.data;

  const { data, error } = await caller.supabase
    .from('bookings')
    .select(
      `*,
       meal_requests!bookings_request_id_fkey(
         seeker_id,
         companion_id,
         seeker:users!meal_requests_seeker_id_fkey(name),
         companion:users!meal_requests_companion_id_fkey(name)
       ),
       payments(escrow_status)`,
    )
    .eq('id', id)
    .maybeSingle();

  if (error) {
    return apiError('internal_error', `Could not load booking: ${error.message}`);
  }
  if (!data) {
    return apiError('not_found', 'Booking not found.');
  }

  const row = data as unknown as BookingRow & {
    meal_requests: {
      seeker_id: string;
      companion_id: string;
      seeker: { name: string | null } | null;
      companion: { name: string | null } | null;
    } | null;
    payments: Array<{ escrow_status: EscrowStatus }> | null;
  };

  if (!row.meal_requests) {
    return apiError('not_found', 'Booking is missing its request linkage.');
  }
  const seekerId = row.meal_requests.seeker_id;
  const companionId = row.meal_requests.companion_id;
  const counterpartName =
    seekerId === caller.userId
      ? (row.meal_requests.companion?.name ?? null)
      : (row.meal_requests.seeker?.name ?? null);
  const escrowStatus = row.payments?.[0]?.escrow_status ?? null;

  return NextResponse.json({
    booking: {
      id: row.id,
      request_id: row.request_id,
      activity_type: row.activity_type,
      venue_name: row.venue_name,
      venue_location: row.venue_location,
      scheduled_time: row.scheduled_time,
      budget_tier: row.budget_tier,
      companion_fee: Number(row.companion_fee),
      status: row.status,
      created_at: row.created_at,
      seeker_id: seekerId,
      companion_id: companionId,
      counterpart_name: counterpartName,
      escrow_status: escrowStatus,
    },
  });
}
