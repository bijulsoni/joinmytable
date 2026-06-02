'use server';

// Admin override for completing a booking.
//
// Completion normally requires the SEEKER to confirm (they attest the
// companion delivered). But a seeker can go silent after a good meet,
// which would trap the companion's payout. This lets an admin complete
// the booking on their behalf — same effect as the seeker's confirm,
// just admin-initiated and logged.
//
// Defense in depth: re-checks requireAdmin() even though the /admin
// layout already gates the page.

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/admin';
import { authAdminClient } from '@/lib/auth/db';
import { notify } from '@/lib/notifications';
import { logger } from '@/lib/logger';

const log = logger.child({ module: 'admin-bookings' });

const Schema = z.object({ bookingId: z.string().uuid('Invalid booking id.') });

export type AdminCompleteResult = { ok: true } | { ok: false; error: string };

export async function adminCompleteBookingAction(input: {
  bookingId: string;
}): Promise<AdminCompleteResult> {
  await requireAdmin();

  const parsed = Schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid submission.' };
  }
  const { bookingId } = parsed.data;
  const admin = authAdminClient();

  const { data: bRaw, error: bErr } = await admin
    .from('bookings')
    .select(
      'id, status, activity_type, meal_requests!bookings_request_id_fkey(seeker_id, companion_id)',
    )
    .eq('id', bookingId)
    .maybeSingle();
  if (bErr) return { ok: false, error: 'Could not load the booking.' };
  if (!bRaw) return { ok: false, error: 'Booking not found.' };
  const booking = bRaw as {
    id: string;
    status: string;
    activity_type: string;
    meal_requests:
      | { seeker_id: string; companion_id: string }
      | { seeker_id: string; companion_id: string }[]
      | null;
  };
  if (booking.status !== 'confirmed') {
    return { ok: false, error: `Booking is already ${booking.status}.` };
  }

  const { error: updErr } = await admin
    .from('bookings')
    .update({ status: 'completed' })
    .eq('id', bookingId);
  if (updErr) return { ok: false, error: 'Could not complete the booking.' };

  // Mirror the seeker-completion side effects.
  await admin.from('payments').update({ escrow_status: 'released' }).eq('booking_id', bookingId);
  await admin.from('messages').insert({
    booking_id: bookingId,
    sender_id: null,
    body: 'Activity marked complete by Konnly. Your review unlocks now.',
    is_system_message: true,
  });

  const mr = Array.isArray(booking.meal_requests)
    ? booking.meal_requests[0]
    : booking.meal_requests;
  if (mr) {
    for (const uid of [mr.seeker_id, mr.companion_id]) {
      void notify('booking_completed', {
        recipient_user_id: uid,
        data: { activityType: booking.activity_type, bookingId },
      });
      void notify('review_prompt', {
        recipient_user_id: uid,
        data: { activityType: booking.activity_type, bookingId },
      });
    }
  }

  log.info({ bookingId }, 'admin override-completed booking');
  revalidatePath('/admin/bookings');
  return { ok: true };
}
