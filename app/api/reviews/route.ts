import 'server-only';

// POST /api/reviews — submit a review for a completed booking.
//
// Authorization is handled by RLS (reviews_insert_completed_participant)
// which enforces: reviewer_id = auth.uid() AND booking is completed AND
// reviewer is a participant AND reviewee is the counterpart.
//
// One review per reviewer per booking is enforced by a unique index
// in the schema. Returns the inserted row.

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, parseJsonBody, requireAuth } from '@/app/api/_lib';
import { uuidSchema } from '@/app/api/_lib/validators';
import type { BookingRow } from '../bookings/_lib/types';
import type { MealRequestRow } from '../requests/_lib/types';

const createReviewSchema = z.object({
  booking_id: uuidSchema,
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(2000).optional(),
});

interface ReviewRow {
  id: string;
  booking_id: string;
  reviewer_id: string;
  reviewee_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
}

export async function POST(request: NextRequest) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;
  const { caller } = guard;

  const body = await parseJsonBody(request, createReviewSchema);
  if (!body.ok) return body.response;
  const { booking_id, rating, comment } = body.data;

  // Load the booking and its request to derive reviewee. RLS gates both
  // — if the caller isn't a participant, the booking won't be visible.
  const { data: bookingRaw, error: bookingErr } = await caller.supabase
    .from('bookings')
    .select('*, meal_requests!bookings_request_id_fkey(seeker_id, companion_id)')
    .eq('id', booking_id)
    .maybeSingle();

  if (bookingErr) {
    return apiError('internal_error', `Could not load booking: ${bookingErr.message}`);
  }
  if (!bookingRaw) {
    return apiError('not_found', 'Booking not found.');
  }
  const booking = bookingRaw as BookingRow & {
    meal_requests: Pick<MealRequestRow, 'seeker_id' | 'companion_id'> | null;
  };
  if (!booking.meal_requests) {
    return apiError('not_found', 'Booking is missing its request linkage.');
  }
  if (booking.status !== 'completed') {
    return apiError('conflict', 'Reviews are only allowed for completed bookings.');
  }

  const seekerId = booking.meal_requests.seeker_id;
  const companionId = booking.meal_requests.companion_id;

  let revieweeId: string;
  if (caller.userId === seekerId) {
    revieweeId = companionId;
  } else if (caller.userId === companionId) {
    revieweeId = seekerId;
  } else {
    return apiError('forbidden', 'Only participants of this booking can leave a review.');
  }

  const { data: inserted, error: insertErr } = await caller.supabase
    .from('reviews')
    .insert({
      booking_id,
      reviewer_id: caller.userId,
      reviewee_id: revieweeId,
      rating,
      comment: comment ?? null,
    })
    .select('*')
    .single();

  if (insertErr || !inserted) {
    // Surface a friendly error on the "one review per reviewer-booking" guard.
    if (insertErr?.message.toLowerCase().includes('duplicate') || insertErr?.code === '23505') {
      return apiError('conflict', 'You have already reviewed this booking.');
    }
    return apiError('internal_error', `Could not save review: ${insertErr?.message ?? 'no row'}`);
  }

  return NextResponse.json({ review: inserted as ReviewRow }, { status: 201 });
}
