// Sent 2 hours before the scheduled activity.

import type { ActivityType } from '@/lib/types';
import {
  activityLabel,
  activityWithArticle,
  appUrl,
  escapeHtml,
  layout,
  plain,
  type EmailContent,
  type EmailTemplate,
} from './_shared';

export interface MealReminderData {
  recipientName: string;
  otherPartyName: string;
  activityType: ActivityType;
  venueName: string;
  venueAddress?: string;
  scheduledTimeDisplay: string;
  bookingId: string;
}

export const mealReminderTemplate: EmailTemplate<MealReminderData> = (data): EmailContent => {
  const subject = `Reminder: Your ${activityWithArticle(data.activityType)} at ${data.venueName} is in 2 hours`;
  const ctaHref = appUrl(`/bookings/${data.bookingId}`);

  const lineAddress = data.venueAddress
    ? `<p style="margin:0 0 8px;color:#6b7280;">${escapeHtml(data.venueAddress)}</p>`
    : '';

  const html = layout({
    preheader: `With ${data.otherPartyName} at ${data.venueName}.`,
    heading: 'See you soon',
    bodyHtml: `
      <p>Hi ${escapeHtml(data.recipientName)},</p>
      <p>Quick reminder: your ${activityLabel(data.activityType).toLowerCase()} with <strong>${escapeHtml(data.otherPartyName)}</strong> is in about 2 hours.</p>
      <p style="margin:0 0 4px;"><strong>${escapeHtml(data.venueName)}</strong></p>
      ${lineAddress}
      <p style="margin:0 0 8px;"><strong>When:</strong> ${escapeHtml(data.scheduledTimeDisplay)}</p>
      <p>Running late or need to message? Open the booking in the app.</p>
    `,
    ctaLabel: 'Open booking',
    ctaHref,
  });

  const text = plain(
    [
      `Hi ${data.recipientName},`,
      `Quick reminder: your ${activityLabel(data.activityType).toLowerCase()} with ${data.otherPartyName} is in about 2 hours.`,
      `Where: ${data.venueName}${data.venueAddress ? ` (${data.venueAddress})` : ''}`,
      `When: ${data.scheduledTimeDisplay}`,
    ],
    { label: 'Open booking', href: ctaHref },
  );

  return { subject, html, text };
};
