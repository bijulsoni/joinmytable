// Both parties get this once a booking is confirmed.

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

export interface BookingConfirmedData {
  recipientName: string;
  otherPartyName: string;
  activityType: ActivityType;
  venueName: string;
  /** Pre-formatted, recipient-timezone string (e.g. "Fri May 22 at 12:30 PM"). */
  scheduledTimeDisplay: string;
  /** Short date for the subject line (e.g. "May 22"). */
  scheduledDateShort: string;
  bookingId: string;
}

export const bookingConfirmedTemplate: EmailTemplate<BookingConfirmedData> = (
  data,
): EmailContent => {
  const subject = `Your ${activityWithArticle(data.activityType)} is confirmed — ${data.venueName} on ${data.scheduledDateShort}`;
  const ctaHref = appUrl(`/bookings/${data.bookingId}`);

  const html = layout({
    preheader: `With ${data.otherPartyName} at ${data.venueName}.`,
    heading: 'Your booking is confirmed',
    bodyHtml: `
      <p>Hi ${escapeHtml(data.recipientName)},</p>
      <p>You’re set to share ${activityLabel(data.activityType).toLowerCase()} with <strong>${escapeHtml(data.otherPartyName)}</strong>.</p>
      <p style="margin:0 0 8px;"><strong>Where:</strong> ${escapeHtml(data.venueName)}</p>
      <p style="margin:0 0 8px;"><strong>When:</strong> ${escapeHtml(data.scheduledTimeDisplay)}</p>
      <p>You can chat in the app any time before you meet.</p>
    `,
    ctaLabel: 'Open booking',
    ctaHref,
  });

  const text = plain(
    [
      `Hi ${data.recipientName},`,
      `You’re set to share ${activityLabel(data.activityType).toLowerCase()} with ${data.otherPartyName}.`,
      `Where: ${data.venueName}`,
      `When: ${data.scheduledTimeDisplay}`,
      'You can chat in the app any time before you meet.',
    ],
    { label: 'Open booking', href: ctaHref },
  );

  return { subject, html, text };
};
