import 'server-only';

// POST /api/payments/checkout  { bookingId }
//
// Creates a Stripe Checkout Session for the seeker to pay the
// companionship fee on a confirmed booking, and returns the hosted
// payment URL. Money lands in the platform's Stripe account; companion
// payout is manual (Venmo/Zelle) during beta.
//
// Guards: caller must be the SEEKER on the booking, the booking must be
// 'confirmed', and it must not already be paid.

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { apiAdminClient, apiError, parseJsonBody, requireAuth } from '@/app/api/_lib';
import { getStripe, isStripeConfigured } from '@/lib/stripe/client';

const Schema = z.object({ bookingId: z.string().uuid('Invalid booking id.') });

export async function POST(req: NextRequest) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;
  const { caller } = guard;

  if (!isStripeConfigured()) {
    return apiError('internal_error', 'Payments are not configured yet.');
  }
  const body = await parseJsonBody(req, Schema);
  if (!body.ok) return body.response;
  const { bookingId } = body.data;

  // Admin read: we need the request linkage (to check the caller is the
  // seeker) + the payment row, which seekers can't read under RLS.
  const admin = apiAdminClient();
  const { data: bookingRaw, error: bErr } = await admin
    .from('bookings')
    .select(
      'id, status, activity_type, companion_fee, request_id, meal_requests!bookings_request_id_fkey(seeker_id)',
    )
    .eq('id', bookingId)
    .maybeSingle();
  if (bErr) return apiError('internal_error', `Could not load booking: ${bErr.message}`);
  if (!bookingRaw) return apiError('not_found', 'Booking not found.');
  const booking = bookingRaw as unknown as {
    id: string;
    status: string;
    activity_type: string;
    companion_fee: number | string;
    request_id: string;
    meal_requests: { seeker_id: string } | { seeker_id: string }[] | null;
  };
  const mr = Array.isArray(booking.meal_requests)
    ? booking.meal_requests[0]
    : booking.meal_requests;
  if (!mr) return apiError('not_found', 'Booking is missing its request linkage.');
  if (mr.seeker_id !== caller.userId) {
    return apiError('forbidden', 'Only the seeker can pay for this booking.');
  }
  if (booking.status !== 'confirmed') {
    return apiError('conflict', `This booking is ${booking.status}; nothing to pay.`);
  }

  const { data: payRaw } = await admin
    .from('payments')
    .select('id, paid_at, fee_amount')
    .eq('booking_id', bookingId)
    .maybeSingle();
  const payment = payRaw as {
    id: string;
    paid_at: string | null;
    fee_amount: number | string;
  } | null;
  if (payment?.paid_at) {
    return apiError('conflict', 'This booking is already paid.');
  }

  const feeNum = Number(payment?.fee_amount ?? booking.companion_fee);
  if (!Number.isFinite(feeNum) || feeNum <= 0) {
    return apiError('internal_error', 'Could not determine the fee for this booking.');
  }

  const origin = new URL(req.url).origin;
  const stripe = getStripe();
  if (!stripe) return apiError('internal_error', 'Payments are not configured yet.');

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: Math.round(feeNum * 100),
            product_data: {
              name: `Konnly companionship fee — ${booking.activity_type.replace('_', ' ')}`,
            },
          },
        },
      ],
      // Correlate the webhook back to our rows.
      metadata: { bookingId, paymentId: payment?.id ?? '' },
      success_url: `${origin}/plans/${booking.request_id}?paid=1`,
      cancel_url: `${origin}/plans/${booking.request_id}?canceled=1`,
    });

    // Stash the session id so the webhook can find the row even if
    // metadata is ever missing.
    if (payment?.id) {
      await admin
        .from('payments')
        .update({ stripe_checkout_session_id: session.id })
        .eq('id', payment.id);
    }

    if (!session.url) {
      return apiError('internal_error', 'Stripe did not return a checkout URL.');
    }
    return NextResponse.json({ url: session.url });
  } catch (err) {
    return apiError(
      'internal_error',
      `Could not start checkout: ${err instanceof Error ? err.message : 'unknown error'}`,
    );
  }
}
