import 'server-only';

// Notifications dispatcher.
//
// One funnel that Core API state-transition handlers call to fire
// transactional emails. Never throws — a failed notification must not
// break a booking flow.
//
// Designed so push notifications can be added later behind the same
// `notify(event, payload)` call.

import { logger } from '@/lib/logger';
import { sendEmail } from '@/lib/email';
import * as templates from '@/lib/email/templates';
import { createSupabaseAdminClient } from '@/lib/supabase/server';

const log = logger.child({ module: 'notifications' });

export type NotificationEvent =
  | 'request_received'
  | 'request_accepted'
  | 'request_declined'
  | 'booking_confirmed'
  | 'payment_confirmed'
  | 'meal_reminder'
  | 'booking_completed'
  | 'review_prompt';

// Map snake_case events to the camelCase template export names.
const TEMPLATE_KEY: Record<NotificationEvent, keyof typeof templates> = {
  request_received: 'requestReceivedTemplate',
  request_accepted: 'requestAcceptedTemplate',
  request_declined: 'requestDeclinedTemplate',
  booking_confirmed: 'bookingConfirmedTemplate',
  payment_confirmed: 'paymentConfirmedTemplate',
  meal_reminder: 'mealReminderTemplate',
  booking_completed: 'bookingCompletedTemplate',
  review_prompt: 'reviewPromptTemplate',
};

export interface NotifyPayload {
  /** Recipient user id — preferred. */
  recipient_user_id?: string;
  /** Optional override email. Only used if recipient_user_id is unset. */
  to_email?: string;
  /** Free-form data passed to the template (all templates accept partials). */
  data?: Record<string, unknown>;
}

interface Recipient {
  email: string | null;
  name: string | null;
}

async function resolveRecipient(payload: NotifyPayload): Promise<Recipient> {
  if (payload.recipient_user_id) {
    try {
      const admin = createSupabaseAdminClient();
      const { data } = await admin
        .from('users')
        .select('email, name')
        .eq('id', payload.recipient_user_id)
        .maybeSingle();
      const row = data as { email: string | null; name: string | null } | null;
      return { email: row?.email ?? null, name: row?.name ?? null };
    } catch (err) {
      log.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'recipient lookup failed',
      );
    }
  }
  return { email: payload.to_email ?? null, name: null };
}

export async function notify(event: NotificationEvent, payload: NotifyPayload): Promise<void> {
  try {
    const { email, name } = await resolveRecipient(payload);
    if (!email) {
      log.info({ event }, 'no recipient email — skipping notification');
      return;
    }

    const tplKey = TEMPLATE_KEY[event];
    const tplFn = templates[tplKey] as unknown;
    if (typeof tplFn !== 'function') {
      log.warn({ event, tplKey }, 'template not found — skipping');
      return;
    }

    // The templates are typed against per-event data shapes (e.g.
    // RequestReceivedData). We pass through whatever the caller gave us
    // plus the resolved recipient name; mismatches log + fall through
    // without throwing.
    const data = { ...(payload.data ?? {}), recipientName: name } as Record<string, unknown>;
    // Cast safe-only at this seam: notify() is a generic dispatcher and
    // its callers commit to passing the right shape for each event.
    const result = await sendEmail(
      email,
      tplFn as Parameters<typeof sendEmail>[1],
      data as Parameters<typeof sendEmail>[2],
    );
    if (!result.success) {
      log.info({ event, err: result.error }, 'email send returned not-ok');
    }
  } catch (err) {
    log.warn(
      { event, err: err instanceof Error ? err.message : String(err) },
      'notify() swallowed an error',
    );
  }
}
