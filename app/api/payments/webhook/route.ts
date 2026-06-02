import 'server-only';

// POST /api/payments/webhook
//
// Stripe calls this when a Checkout payment completes. We verify the
// signature, then flip the matching payments row to paid — so the
// booking shows paid in the app without anyone watching the Stripe
// dashboard. Configure the endpoint URL + signing secret in Stripe
// (see docs/SETUP-resend-stripe.md).
//
// Must read the RAW request body for signature verification — never
// JSON.parse before constructEvent.

import { NextResponse, type NextRequest } from 'next/server';
import type Stripe from 'stripe';
import { apiAdminClient } from '@/app/api/_lib';
import { getStripe, STRIPE_WEBHOOK_SECRET } from '@/lib/stripe/client';
import { notify } from '@/lib/notifications';
import { logger } from '@/lib/logger';

const log = logger.child({ module: 'payments.webhook' });

export async function POST(req: NextRequest) {
  const stripe = getStripe();
  if (!stripe || !STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'not_configured' }, { status: 500 });
  }

  const sig = req.headers.get('stripe-signature');
  if (!sig) return NextResponse.json({ error: 'missing_signature' }, { status: 400 });

  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    log.warn({ err: err instanceof Error ? err.message : String(err) }, 'signature verify failed');
    return NextResponse.json({ error: 'invalid_signature' }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const bookingId = session.metadata?.bookingId ?? null;
    const paymentId = session.metadata?.paymentId || null;
    const paymentIntentId =
      typeof session.payment_intent === 'string' ? session.payment_intent : null;

    const admin = apiAdminClient();
    const patch = {
      paid_at: new Date().toISOString(),
      stripe_payment_intent_id: paymentIntentId,
    };

    // Prefer the explicit payment id; fall back to the checkout session id.
    let matched = false;
    if (paymentId) {
      const { error } = await admin.from('payments').update(patch).eq('id', paymentId);
      matched = !error;
    }
    if (!matched) {
      await admin.from('payments').update(patch).eq('stripe_checkout_session_id', session.id);
    }

    // Email the seeker a receipt/confirmation (best-effort).
    if (bookingId) {
      const { data: mrRaw } = await admin
        .from('bookings')
        .select('meal_requests!bookings_request_id_fkey(seeker_id)')
        .eq('id', bookingId)
        .maybeSingle();
      const mr = (
        mrRaw as { meal_requests: { seeker_id: string } | { seeker_id: string }[] | null } | null
      )?.meal_requests;
      const seekerId = Array.isArray(mr) ? mr[0]?.seeker_id : mr?.seeker_id;
      if (seekerId) {
        void notify('payment_confirmed', {
          recipient_user_id: seekerId,
          data: { bookingId },
        });
      }
    }

    log.info({ bookingId, sessionId: session.id }, 'checkout completed → payment marked paid');
  }

  // Always 200 so Stripe doesn't retry events we don't handle.
  return NextResponse.json({ received: true });
}
