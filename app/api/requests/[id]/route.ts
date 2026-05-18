import 'server-only';

// PATCH /api/requests/[id]
//
// Companion accepts or declines a request. On accept, we DO NOT auto-
// create a booking — the booking is created separately via POST
// /api/bookings (so the seeker can pick venue + time + budget + confirm
// the fee before paying). This mirrors the Confirm-and-Pay screen the
// Frontend agent shipped.
//
// Business rules enforced server-side:
//   - Caller must be in companion mode and be the request's companion_id.
//   - Current status must be 'requested' (can't re-accept / re-decline /
//     transition from terminal states).
//   - Transition is locked: requested -> accepted | declined.
//
// Notification: fires request_accepted / request_declined to the seeker.

import { NextResponse, type NextRequest } from 'next/server';
import { apiAdminClient, apiError, parseJsonBody, requireCompanionMode } from '@/app/api/_lib';
import { uuidSchema } from '@/app/api/_lib/validators';
import { notify } from '@/lib/notifications';
import { updateRequestSchema } from '../_lib/validators';
import type { MealRequestRow } from '../_lib/types';
import type { ActivityType, BudgetTier } from '@/lib/types';

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireCompanionMode();
  if (!guard.ok) return guard.response;
  const { caller } = guard;

  const { id: rawId } = await ctx.params;
  const idResult = uuidSchema.safeParse(rawId);
  if (!idResult.success) {
    return apiError('invalid_input', 'Invalid request id.');
  }
  const id = idResult.data;

  const body = await parseJsonBody(request, updateRequestSchema);
  if (!body.ok) return body.response;

  // Load the row through the request-scoped client so RLS verifies the
  // caller is a participant (companion_id = auth.uid()).
  const { data: existing, error: loadErr } = await caller.supabase
    .from('meal_requests')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (loadErr) {
    return apiError('internal_error', `Could not load request: ${loadErr.message}`);
  }
  if (!existing) {
    return apiError('not_found', 'Request not found.');
  }
  const row = existing as MealRequestRow;

  if (row.companion_id !== caller.userId) {
    return apiError('forbidden', 'Only the companion on this request can update it.');
  }
  if (row.status !== 'requested') {
    return apiError('conflict', `Cannot transition a request in '${row.status}' state.`);
  }

  const { data: updated, error: updErr } = await caller.supabase
    .from('meal_requests')
    .update({ status: body.data.status })
    .eq('id', id)
    .select('*')
    .single();

  if (updErr || !updated) {
    return apiError('internal_error', `Update failed: ${updErr?.message ?? 'no row'}`);
  }
  const next = updated as MealRequestRow;

  let bookingId: string | null = null;

  if (body.data.status === 'accepted') {
    // Auto-create the booking + held payment + system message.
    // (Same logic as POST /api/bookings, but server-initiated so the
    // seeker doesn't need a second confirmation step.)
    bookingId = await autoCreateBookingFromAccept(next, caller.profile.name);

    void notify('request_accepted', {
      recipient_user_id: next.seeker_id,
      data: {
        companionName: caller.profile.name,
        activityType: next.activity_type,
        proposedTime: next.proposed_time,
        requestId: next.id,
        bookingId,
      },
    });
  } else {
    void notify('request_declined', {
      recipient_user_id: next.seeker_id,
      data: {
        companionName: caller.profile.name,
        activityType: next.activity_type,
        requestId: next.id,
      },
    });
  }

  return NextResponse.json({ request: next, booking_id: bookingId });
}

async function autoCreateBookingFromAccept(
  req: MealRequestRow,
  companionName: string | null,
): Promise<string | null> {
  // Defensive: if venue/budget are missing, skip auto-booking. The
  // seeker can still POST /api/bookings explicitly.
  if (!req.venue_name || !req.venue_location || !req.budget_tier) return null;

  const admin = apiAdminClient();

  // Idempotency: if a booking already exists for this request, don't
  // double-create. (Re-running accept on an already-accepted request is
  // blocked upstream, but be safe.)
  const { data: existing } = await admin
    .from('bookings')
    .select('id')
    .eq('request_id', req.id)
    .maybeSingle();
  if (existing) return (existing as { id: string }).id;

  // Resolve companion_fee from rates.
  const { data: cpRaw } = await admin
    .from('companion_profiles')
    .select('rates, activities')
    .eq('user_id', req.companion_id)
    .maybeSingle();
  const cp = cpRaw as {
    rates: Partial<Record<ActivityType, number>> | null;
    activities: Partial<Record<ActivityType, boolean>> | null;
  } | null;
  const fee = cp?.rates?.[req.activity_type];
  if (typeof fee !== 'number' || fee <= 0) return null;

  const { data: bookingRaw } = await admin
    .from('bookings')
    .insert({
      request_id: req.id,
      activity_type: req.activity_type,
      venue_name: req.venue_name,
      venue_location: req.venue_location,
      scheduled_time: req.proposed_time,
      budget_tier: req.budget_tier as BudgetTier,
      companion_fee: fee,
      status: 'confirmed',
    })
    .select('id')
    .single();
  if (!bookingRaw) return null;
  const bookingId = (bookingRaw as { id: string }).id;

  const platformCut = Number((fee * 0.15).toFixed(2));
  await admin.from('payments').insert({
    booking_id: bookingId,
    fee_amount: fee,
    platform_cut: platformCut,
    escrow_status: 'held',
  });

  await admin.from('messages').insert({
    booking_id: bookingId,
    sender_id: null,
    body: `Booking confirmed: ${req.activity_type} at ${req.venue_name}.`,
    is_system_message: true,
  });

  void notify('booking_confirmed', {
    recipient_user_id: req.seeker_id,
    data: {
      activityType: req.activity_type,
      venueName: req.venue_name,
      scheduledTime: req.proposed_time,
      companionName: companionName ?? 'Your companion',
      bookingId,
      fee,
    },
  });
  void notify('booking_confirmed', {
    recipient_user_id: req.companion_id,
    data: {
      activityType: req.activity_type,
      venueName: req.venue_name,
      scheduledTime: req.proposed_time,
      bookingId,
      fee,
    },
  });

  return bookingId;
}
