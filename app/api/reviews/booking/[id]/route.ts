import 'server-only';

// GET /api/reviews/booking/[id]
//
// Review state for a SINGLE booking, from the caller's perspective. Used
// by the two-way review UI (the inline section on /plans/[id] and the
// dedicated /bookings/[id]/review page).
//
// Returns:
//   - booking summary (activity, status, counterpart name) so the UI can
//     render without a second round-trip
//   - caller_role + can_review (only completed bookings unlock reviews)
//   - my_review     — the caller's review of the counterpart, or null
//   - their_review  — the counterpart's review of the caller, or null
//
// RLS does the gatekeeping: the booking is only visible to its two
// participants (so a non-participant gets 404), and reviews are
// public-read.

import { NextResponse } from 'next/server';
import { apiError, requireAuth } from '@/app/api/_lib';
import { uuidSchema } from '@/app/api/_lib/validators';

interface ReviewLite {
  id: string;
  reviewer_id: string;
  reviewee_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;
  const { caller } = guard;

  const { id: rawId } = await ctx.params;
  const idResult = uuidSchema.safeParse(rawId);
  if (!idResult.success) {
    return apiError('invalid_input', 'Invalid booking id.');
  }
  const bookingId = idResult.data;

  // Booking + its request linkage. RLS hides it from non-participants.
  const { data: bookingRaw, error: bookingErr } = await caller.supabase
    .from('bookings')
    .select(
      'id, activity_type, status, scheduled_time, meal_requests!bookings_request_id_fkey(seeker_id, companion_id)',
    )
    .eq('id', bookingId)
    .maybeSingle();

  if (bookingErr) {
    return apiError('internal_error', `Could not load booking: ${bookingErr.message}`);
  }
  if (!bookingRaw) {
    return apiError('not_found', 'Booking not found.');
  }
  const booking = bookingRaw as {
    id: string;
    activity_type: string;
    status: string;
    scheduled_time: string;
    meal_requests:
      | { seeker_id: string; companion_id: string }
      | { seeker_id: string; companion_id: string }[]
      | null;
  };
  const reqLink = Array.isArray(booking.meal_requests)
    ? booking.meal_requests[0]
    : booking.meal_requests;
  if (!reqLink) {
    return apiError('not_found', 'Booking is missing its request linkage.');
  }

  let callerRole: 'seeker' | 'companion';
  let counterpartId: string;
  if (caller.userId === reqLink.seeker_id) {
    callerRole = 'seeker';
    counterpartId = reqLink.companion_id;
  } else if (caller.userId === reqLink.companion_id) {
    callerRole = 'companion';
    counterpartId = reqLink.seeker_id;
  } else {
    // RLS should already prevent this, but be explicit.
    return apiError('forbidden', 'You are not a participant of this booking.');
  }

  const { data: counterpartRow } = await caller.supabase
    .from('users')
    .select('name')
    .eq('id', counterpartId)
    .maybeSingle();
  const counterpartName = (counterpartRow as { name: string | null } | null)?.name ?? 'Someone';

  // Both reviews for this booking (public-read). At most two rows.
  const { data: reviewRows, error: reviewErr } = await caller.supabase
    .from('reviews')
    .select('id, reviewer_id, reviewee_id, rating, comment, created_at')
    .eq('booking_id', bookingId);

  if (reviewErr) {
    return apiError('internal_error', `Could not load reviews: ${reviewErr.message}`);
  }

  const rows = (reviewRows ?? []) as ReviewLite[];
  const my = rows.find((r) => r.reviewer_id === caller.userId) ?? null;
  const theirs = rows.find((r) => r.reviewer_id === counterpartId) ?? null;

  return NextResponse.json({
    booking: {
      id: booking.id,
      activity_type: booking.activity_type,
      status: booking.status,
      scheduled_time: booking.scheduled_time,
      counterpart_id: counterpartId,
      counterpart_name: counterpartName,
    },
    caller_role: callerRole,
    can_review: booking.status === 'completed',
    my_review: my && { rating: my.rating, comment: my.comment, created_at: my.created_at },
    their_review: theirs && {
      rating: theirs.rating,
      comment: theirs.comment,
      created_at: theirs.created_at,
    },
  });
}
