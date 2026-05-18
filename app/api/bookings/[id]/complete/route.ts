import 'server-only';

// PATCH /api/bookings/[id]/complete
//
// Seeker marks the booking complete. Transition: confirmed -> completed.
// Side-effects:
//   - payments.escrow_status -> 'released' (mock; Phase 4 wires Stripe transfer)
//   - System message into the chat thread.
//   - booking_completed + review_prompt notifications to both parties.
//
// Authorization: caller must be a participant; the seeker is the
// canonical "completer". Either side can call it.

import { NextResponse } from 'next/server';
import { apiError, requireAuth } from '@/app/api/_lib';
import { uuidSchema } from '@/app/api/_lib/validators';
import { notify } from '@/lib/notifications';
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

  // Read the booking through the request-scoped client — RLS confirms
  // the caller is a participant.
  const { data: bookingRaw, error: bookingErr } = await caller.supabase
    .from('bookings')
    .select('*, meal_requests!bookings_request_id_fkey(seeker_id, companion_id)')
    .eq('id', id)
    .maybeSingle();

  if (bookingErr) {
    return apiError('internal_error', `Could not load booking: ${bookingErr.message}`);
  }
  if (!bookingRaw) {
    return apiError('not_found', 'Booking not found.');
  }
  const booking = bookingRaw as BookingRow & {
    meal_requests: { seeker_id: string; companion_id: string } | null;
  };
  if (!booking.meal_requests) {
    return apiError('not_found', 'Booking is missing its request linkage.');
  }
  if (booking.status !== 'confirmed') {
    return apiError('conflict', `Cannot complete a booking in '${booking.status}' state.`);
  }

  // Transition via the same client — RLS allows participants to update.
  const { error: updErr } = await caller.supabase
    .from('bookings')
    .update({ status: 'completed' })
    .eq('id', id);
  if (updErr) {
    return apiError('internal_error', `Could not complete booking: ${updErr.message}`);
  }

  // Payment + system message via admin client (RLS forbids client writes).
  const admin = apiAdminClient();
  await admin.from('payments').update({ escrow_status: 'released' }).eq('booking_id', id);

  await admin.from('messages').insert({
    booking_id: id,
    sender_id: null,
    body: 'Activity completed. Your review unlocks now.',
    is_system_message: true,
  });

  const seekerId = booking.meal_requests.seeker_id;
  const companionId = booking.meal_requests.companion_id;

  for (const userId of [seekerId, companionId]) {
    void notify('booking_completed', {
      recipient_user_id: userId,
      data: { activityType: booking.activity_type, bookingId: id },
    });
    void notify('review_prompt', {
      recipient_user_id: userId,
      data: { activityType: booking.activity_type, bookingId: id },
    });
  }

  return NextResponse.json({
    booking: { ...booking, status: 'completed', companion_fee: Number(booking.companion_fee) },
  });
}
