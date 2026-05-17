// Sent 1 hour after the booking is completed if no review has been posted.

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

export interface ReviewPromptData {
  recipientName: string;
  otherPartyName: string;
  activityType: ActivityType;
  bookingId: string;
}

export const reviewPromptTemplate: EmailTemplate<ReviewPromptData> = (data): EmailContent => {
  const subject = `How was your ${activityWithArticle(data.activityType)} with ${data.otherPartyName}?`;
  const ctaHref = appUrl(`/bookings/${data.bookingId}/review`);

  const html = layout({
    preheader: 'A quick review keeps JoinMyTable warm and trusted.',
    heading: 'Tell us how it went',
    bodyHtml: `
      <p>Hi ${escapeHtml(data.recipientName)},</p>
      <p>How was your ${activityLabel(data.activityType).toLowerCase()} with <strong>${escapeHtml(data.otherPartyName)}</strong>?</p>
      <p>Even a single rating helps your companion and helps future seekers find a good match.</p>
    `,
    ctaLabel: 'Leave a review',
    ctaHref,
  });

  const text = plain(
    [
      `Hi ${data.recipientName},`,
      `How was your ${activityLabel(data.activityType).toLowerCase()} with ${data.otherPartyName}?`,
      'Even a single rating helps your companion and helps future seekers find a good match.',
    ],
    { label: 'Leave a review', href: ctaHref },
  );

  return { subject, html, text };
};
