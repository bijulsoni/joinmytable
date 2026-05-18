import 'server-only';

// PATCH /api/bookings/[id]/cancel
//
// Either participant cancels the booking. Transition: confirmed -> cancelled.
// Side-effects:
//   - payments.escrow_status -> 'refunded' (mock; Phase 4 wires Stripe refund)
//   - System message into the chat thread.
//
// Authorization: caller must be a participant. Booking must be in
// 'confirmed' status (can't cancel a completed booking).

import { NextResponse } from 'next/server';
import { apiError, requireAuth } from '@/app/api/_lib';
import { uuidSchema } from '@/app/api/_lib/validators';
import { apiAdminClient } from '@/app/api/_lib';
import type { BookingRow } from '../../_lib/types';

export async function PATCH(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;
  const { caller } = guard;

  const { id: rawId } = await ctx.params;
  const idResult = uuidSchema.safeParse(rawId);
  if (!idResult.success) {
    return apiError('invalid_input', 'Invalid booking id.');
  }
  const id = idResult.data;

  const { data: bookingRaw, error: bookingErr } = await caller.supabase
    .from('bookings')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (bookingErr) {
    return apiError('internal_error', `Could not load booking: ${bookingErr.message}`);
  }
  if (!bookingRaw) {
    return apiError('not_found', 'Booking not found.');
  }
  const booking = bookingRaw as BookingRow;
  if (booking.status !== 'confirmed') {
    return apiError('conflict', `Cannot cancel a booking in '${booking.status}' state.`);
  }

  const { error: updErr } = await caller.supabase
    .from('bookings')
    .update({ status: 'cancelled' })
    .eq('id', id);
  if (updErr) {
    return apiError('internal_error', `Could not cancel booking: ${updErr.message}`);
  }

  const admin = apiAdminClient();
  await admin.from('payments').update({ escrow_status: 'refunded' }).eq('booking_id', id);
  await admin.from('messages').insert({
    booking_id: id,
    sender_id: null,
    body: 'Booking cancelled. The held fee has been refunded.',
    is_system_message: true,
  });

  return NextResponse.json({
    booking: { ...booking, status: 'cancelled', companion_fee: Number(booking.companion_fee) },
  });
}
