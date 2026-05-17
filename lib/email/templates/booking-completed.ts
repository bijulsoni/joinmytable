// Sent after the seeker marks the booking complete.
// Escrow has just released; reviews are now unlocked.

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

export interface BookingCompletedData {
  recipientName: string;
  otherPartyName: string;
  activityType: ActivityType;
  bookingId: string;
}

export const bookingCompletedTemplate: EmailTemplate<BookingCompletedData> = (
  data,
): EmailContent => {
  const subject = `Your ${activityWithArticle(data.activityType)} is complete — please leave a review`;
  const ctaHref = appUrl(`/bookings/${data.bookingId}/review`);

  const html = layout({
    preheader: `How did it go with ${data.otherPartyName}?`,
    heading: 'Thanks for sharing the table',
    bodyHtml: `
      <p>Hi ${escapeHtml(data.recipientName)},</p>
      <p>Your ${activityLabel(data.activityType).toLowerCase()} with <strong>${escapeHtml(data.otherPartyName)}</strong> is marked complete.</p>
      <p>Reviews are two-way and help everyone on JoinMyTable choose great companions. It only takes a moment.</p>
    `,
    ctaLabel: 'Leave a review',
    ctaHref,
  });

  const text = plain(
    [
      `Hi ${data.recipientName},`,
      `Your ${activityLabel(data.activityType).toLowerCase()} with ${data.otherPartyName} is marked complete.`,
      'Reviews are two-way and help everyone on JoinMyTable choose great companions.',
    ],
    { label: 'Leave a review', href: ctaHref },
  );

  return { subject, html, text };
};
