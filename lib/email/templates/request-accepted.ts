// Seeker is notified that the companion accepted their request.

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

export interface RequestAcceptedData {
  seekerName: string;
  companionName: string;
  activityType: ActivityType;
  proposedTime?: string;
  venueName?: string;
  bookingId: string;
}

export const requestAcceptedTemplate: EmailTemplate<RequestAcceptedData> = (data): EmailContent => {
  const subject = `Your ${activityWithArticle(data.activityType)} request was accepted!`;
  const ctaHref = appUrl(`/bookings/${data.bookingId}`);

  const lineWhen = data.proposedTime
    ? `<p style="margin:0 0 8px;"><strong>When:</strong> ${escapeHtml(data.proposedTime)}</p>`
    : '';
  const lineWhere = data.venueName
    ? `<p style="margin:0 0 8px;"><strong>Where:</strong> ${escapeHtml(data.venueName)}</p>`
    : '';

  const html = layout({
    preheader: `${data.companionName} accepted your ${activityLabel(data.activityType).toLowerCase()} request.`,
    heading: 'You’re on!',
    bodyHtml: `
      <p>Hi ${escapeHtml(data.seekerName)},</p>
      <p><strong>${escapeHtml(data.companionName)}</strong> accepted your ${activityLabel(data.activityType).toLowerCase()} request.</p>
      ${lineWhen}
      ${lineWhere}
      <p>Chat is now open and your fee will be held safely in escrow until you mark the activity complete.</p>
    `,
    ctaLabel: 'Open booking',
    ctaHref,
  });

  const text = plain(
    [
      `Hi ${data.seekerName},`,
      `${data.companionName} accepted your ${activityLabel(data.activityType).toLowerCase()} request.`,
      data.proposedTime ? `When: ${data.proposedTime}` : '',
      data.venueName ? `Where: ${data.venueName}` : '',
      'Chat is now open. Your fee is held safely in escrow.',
    ].filter((s) => s.length > 0),
    { label: 'Open booking', href: ctaHref },
  );

  return { subject, html, text };
};
