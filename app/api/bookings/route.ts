import 'server-only';

// POST /api/bookings — seeker confirms an accepted request and creates
//                      the booking + held escrow.
// GET  /api/bookings — list bookings for the caller.
//
// Business rules:
//   - POST: caller must be the seeker on the referenced request.
//   - Request must be in 'accepted' status.
//   - Request must not already have a booking.
//   - companion_fee is locked from companion_profiles.rates[activity_type]
//     at booking time (core product rule #4 — rate is set per-activity by
//     the companion, snapshotted into the booking).
//   - Insert is service-role (RLS forbids client INSERT on bookings).
//   - Mock payment: a payments row is created with escrow_status='held'.
//     Real Stripe Connect lands in Phase 4; the API shape stays stable.
//   - On success: insert a system message into messages and notify both
//     parties.

import { NextResponse, type NextRequest } from 'next/server';
import { apiError, parseJsonBody, requireAuth } from '@/app/api/_lib';
import { notify } from '@/lib/notifications';
import { apiAdminClient } from '@/app/api/_lib';
import type { MealRequestRow } from '../requests/_lib/types';
import { createBookingSchema } from './_lib/validators';
import type { BookingDTO, BookingRow } from './_lib/types';
import type { ActivityType, BudgetTier, EscrowStatus } from '@/lib/types';

interface JoinedListRow extends BookingRow {
  meal_requests: {
    seeker_id: string;
    companion_id: string;
    seeker: { name: string | null } | null;
    companion: { name: string | null } | null;
  } | null;
  payments: Array<{ escrow_status: EscrowStatus }> | null;
}

function toDto(
  row: BookingRow,
  seekerId: string,
  companionId: string,
  counterpartName: string | null,
  escrowStatus: EscrowStatus | null,
): BookingDTO {
  return {
    id: row.id,
    request_id: row.request_id,
    activity_type: row.activity_type,
    venue_name: row.venue_name,
    venue_location: row.venue_location,
    scheduled_time: row.scheduled_time,
    budget_tier: row.budget_tier as BudgetTier,
    companion_fee: Number(row.companion_fee),
    status: row.status,
    created_at: row.created_at,
    seeker_id: seekerId,
    companion_id: companionId,
    counterpart_name: counterpartName,
    escrow_status: escrowStatus,
  };
}

export async function POST(request: NextRequest) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;
  const { caller } = guard;

  const body = await parseJsonBody(request, createBookingSchema);
  if (!body.ok) return body.response;
  const payload = body.data;

  // Use the request-scoped client to read the request — RLS confirms the
  // caller is the seeker on it. If they aren't, RLS hides the row and
  // we surface 'not_found' (deliberate: don't leak that the row exists).
  const { data: requestRow, error: reqErr } = await caller.supabase
    .from('meal_requests')
    .select('*')
    .eq('id', payload.request_id)
    .maybeSingle();
  if (reqErr) {
    return apiError('internal_error', `Could not load request: ${reqErr.message}`);
  }
  if (!requestRow) {
    return apiError('not_found', 'Request not found.');
  }
  const req = requestRow as MealRequestRow;
  if (req.seeker_id !== caller.userId) {
    return apiError('forbidden', 'Only the seeker on this request can create a booking.');
  }
  if (req.status !== 'accepted') {
    return apiError('conflict', `Cannot create a booking for a request in '${req.status}' state.`);
  }

  // Single booking per request. Use admin client to bypass RLS for this
  // check (the booking row might exist but be hidden from the caller via
  // RLS — though that shouldn't happen here since they're the seeker).
  const admin = apiAdminClient();
  const { data: existingBooking } = await admin
    .from('bookings')
    .select('id')
    .eq('request_id', payload.request_id)
    .maybeSingle();
  if (existingBooking) {
    return apiError('conflict', 'This request already has a booking.');
  }

  // Resolve companion_fee from companion_profiles.rates[activity_type].
  const { data: cpRaw, error: cpErr } = await admin
    .from('companion_profiles')
    .select('rates, activities, user_id, users:users!inner(name)')
    .eq('user_id', req.companion_id)
    .maybeSingle();
  if (cpErr) {
    return apiError('internal_error', `Could not load companion profile: ${cpErr.message}`);
  }
  if (!cpRaw) {
    return apiError('not_found', 'Companion profile no longer exists.');
  }
  const cp = cpRaw as unknown as {
    rates: Record<ActivityType, number> | null;
    activities: Record<ActivityType, boolean> | null;
    user_id: string;
    users: { name: string | null };
  };

  const offered = cp.activities?.[req.activity_type] === true;
  if (!offered) {
    return apiError('conflict', `Companion no longer offers ${req.activity_type}.`);
  }
  const fee = cp.rates?.[req.activity_type];
  if (typeof fee !== 'number' || fee <= 0) {
    return apiError('conflict', `Companion has no rate for ${req.activity_type}.`);
  }

  // Create the booking (admin client — RLS forbids client INSERT).
  const { data: bookingRaw, error: bookErr } = await admin
    .from('bookings')
    .insert({
      request_id: payload.request_id,
      activity_type: req.activity_type,
      venue_name: payload.venue_name,
      venue_location: payload.venue_location,
      scheduled_time: payload.scheduled_time,
      budget_tier: payload.budget_tier,
      companion_fee: fee,
      status: 'confirmed',
    })
    .select('*')
    .single();
  if (bookErr || !bookingRaw) {
    return apiError('internal_error', `Could not create booking: ${bookErr?.message ?? 'no row'}`);
  }
  const booking = bookingRaw as BookingRow;

  // Mock payment: hold the companion_fee in escrow. Phase 4 wires Stripe.
  const platformCut = Number((fee * 0.15).toFixed(2));
  const { error: payErr } = await admin.from('payments').insert({
    booking_id: booking.id,
    fee_amount: fee,
    platform_cut: platformCut,
    escrow_status: 'held',
  });
  if (payErr) {
    // Don't fail the booking on payment row insert error — log and continue.
    // The booking is the authoritative state machine; payment is a derived
    // ledger we can rebuild.
    console.warn('payments insert failed (continuing):', payErr.message);
  }

  // System message into the chat thread so participants see a marker.
  await admin.from('messages').insert({
    booking_id: booking.id,
    sender_id: null,
    body: `Booking confirmed: ${req.activity_type} at ${payload.venue_name}.`,
    is_system_message: true,
  });

  // Notify both parties.
  void notify('booking_confirmed', {
    recipient_user_id: req.seeker_id,
    data: {
      activityType: req.activity_type,
      venueName: payload.venue_name,
      scheduledTime: payload.scheduled_time,
      companionName: cp.users.name,
      bookingId: booking.id,
      fee,
    },
  });
  void notify('booking_confirmed', {
    recipient_user_id: req.companion_id,
    data: {
      activityType: req.activity_type,
      venueName: payload.venue_name,
      scheduledTime: payload.scheduled_time,
      seekerName: caller.profile.name,
      bookingId: booking.id,
      fee,
    },
  });
  void notify('payment_confirmed', {
    recipient_user_id: req.seeker_id,
    data: { fee, bookingId: booking.id, activityType: req.activity_type },
  });

  return NextResponse.json(
    { booking: toDto(booking, req.seeker_id, req.companion_id, cp.users.name, 'held') },
    { status: 201 },
  );
}

export async function GET() {
  const authed = await requireAuth();
  if (!authed.ok) return authed.response;
  const { caller } = authed;

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
    .order('scheduled_time', { ascending: true })
    .limit(200);

  if (error) {
    return apiError('internal_error', `Could not load bookings: ${error.message}`);
  }

  const rows = (data ?? []) as JoinedListRow[];
  const bookings = rows
    .filter((row) => row.meal_requests !== null)
    .map((row) => {
      const seekerId = row.meal_requests!.seeker_id;
      const companionId = row.meal_requests!.companion_id;
      const counterpartName =
        seekerId === caller.userId
          ? (row.meal_requests!.companion?.name ?? null)
          : (row.meal_requests!.seeker?.name ?? null);
      const escrowStatus = (row.payments?.[0]?.escrow_status ?? null) as EscrowStatus | null;
      return toDto(row, seekerId, companionId, counterpartName, escrowStatus);
    });

  return NextResponse.json({ bookings });
}
