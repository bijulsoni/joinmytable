import 'server-only';

// GET  /api/messaging/[bookingId] — list messages for a booking thread.
// POST /api/messaging/[bookingId] — send a new message.
//
// Authorization: RLS gates both. The participant check uses the
// is_booking_participant(uuid) helper. System messages (state-change
// markers) are inserted by other endpoints via the admin client; this
// route only handles user-authored messages and rejects attempts to
// impersonate a system message.

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, parseJsonBody, requireAuth } from '@/app/api/_lib';
import { uuidSchema } from '@/app/api/_lib/validators';

const sendMessageSchema = z.object({
  body: z.string().trim().min(1, 'Message cannot be empty.').max(4000, 'Message is too long.'),
});

interface MessageRow {
  id: string;
  booking_id: string;
  sender_id: string | null;
  body: string;
  is_system_message: boolean;
  sent_at: string;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ bookingId: string }> }) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;
  const { caller } = guard;

  const { bookingId: rawId } = await ctx.params;
  const idResult = uuidSchema.safeParse(rawId);
  if (!idResult.success) {
    return apiError('invalid_input', 'Invalid booking id.');
  }
  const bookingId = idResult.data;

  // Confirm the booking exists + caller is a participant (RLS).
  // Return a booking summary alongside the messages so the chat UI can
  // tag bubbles as sent vs received without a second round-trip.
  const { data: bookingRaw, error: bookingErr } = await caller.supabase
    .from('bookings')
    .select(
      `id, activity_type, venue_name, venue_location, scheduled_time, status,
       meal_requests!bookings_request_id_fkey(
         seeker_id,
         companion_id,
         seeker:users!meal_requests_seeker_id_fkey(name),
         companion:users!meal_requests_companion_id_fkey(name)
       )`,
    )
    .eq('id', bookingId)
    .maybeSingle();
  if (bookingErr) {
    return apiError('internal_error', `Could not verify booking: ${bookingErr.message}`);
  }
  if (!bookingRaw) {
    return apiError('not_found', 'Booking not found.');
  }
  const b = bookingRaw as unknown as {
    id: string;
    activity_type: string;
    venue_name: string;
    venue_location: string;
    scheduled_time: string;
    status: string;
    meal_requests: {
      seeker_id: string;
      companion_id: string;
      seeker: { name: string | null } | null;
      companion: { name: string | null } | null;
    } | null;
  };
  if (!b.meal_requests) {
    return apiError('not_found', 'Booking is missing its request linkage.');
  }
  const seekerId = b.meal_requests.seeker_id;
  const companionId = b.meal_requests.companion_id;
  const counterpartName =
    seekerId === caller.userId
      ? (b.meal_requests.companion?.name ?? 'A companion')
      : (b.meal_requests.seeker?.name ?? 'A seeker');

  const { data, error } = await caller.supabase
    .from('messages')
    .select('id, booking_id, sender_id, body, is_system_message, sent_at')
    .eq('booking_id', bookingId)
    .order('sent_at', { ascending: true })
    .limit(500);

  if (error) {
    return apiError('internal_error', `Could not load messages: ${error.message}`);
  }

  // Opening a thread marks it read for this user — drives the offline
  // "you missed this" digest (GET /api/notifications/summary) and clears
  // the unread state once they've actually looked. Best-effort: a failure
  // here must not break loading the conversation.
  const reads = caller.supabase as unknown as {
    from: (t: string) => {
      upsert: (
        row: Record<string, unknown>,
        opts: { onConflict: string },
      ) => Promise<{ error: { message: string } | null }>;
    };
  };
  await reads
    .from('message_reads')
    .upsert(
      { user_id: caller.userId, booking_id: bookingId, last_read_at: new Date().toISOString() },
      { onConflict: 'user_id,booking_id' },
    )
    .catch(() => undefined);

  return NextResponse.json({
    booking: {
      id: b.id,
      activity_type: b.activity_type,
      venue_name: b.venue_name,
      venue_location: b.venue_location,
      scheduled_time: b.scheduled_time,
      status: b.status,
      counterpart_name: counterpartName,
      counterpart_photo_url: null,
      caller_user_id: caller.userId,
    },
    messages: (data ?? []) as MessageRow[],
  });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ bookingId: string }> }) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;
  const { caller } = guard;

  const { bookingId: rawId } = await ctx.params;
  const idResult = uuidSchema.safeParse(rawId);
  if (!idResult.success) {
    return apiError('invalid_input', 'Invalid booking id.');
  }
  const bookingId = idResult.data;

  const body = await parseJsonBody(req, sendMessageSchema);
  if (!body.ok) return body.response;

  // Confirm booking exists + caller is a participant (RLS check).
  const { data: booking, error: bookingErr } = await caller.supabase
    .from('bookings')
    .select('id, status')
    .eq('id', bookingId)
    .maybeSingle();
  if (bookingErr) {
    return apiError('internal_error', `Could not verify booking: ${bookingErr.message}`);
  }
  if (!booking) {
    return apiError('not_found', 'Booking not found.');
  }
  const status = (booking as { id: string; status: string }).status;
  if (status === 'cancelled') {
    return apiError('conflict', 'Cannot message on a cancelled booking.');
  }

  // Insert via the request-scoped client. RLS policy
  // messages_insert_participant enforces is_system_message != true and
  // sender_id = auth.uid().
  const { data: inserted, error: insertErr } = await caller.supabase
    .from('messages')
    .insert({
      booking_id: bookingId,
      sender_id: caller.userId,
      body: body.data.body,
      is_system_message: false,
    })
    .select('id, booking_id, sender_id, body, is_system_message, sent_at')
    .single();

  if (insertErr || !inserted) {
    return apiError('internal_error', `Could not send message: ${insertErr?.message ?? 'no row'}`);
  }

  return NextResponse.json({ message: inserted as MessageRow }, { status: 201 });
}
