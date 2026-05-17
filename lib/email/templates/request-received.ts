// Companion receives a new meal request from a seeker.
//
// Sent by Core API when a meal_request row is inserted.

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

export interface RequestReceivedData {
  companionName: string;
  seekerName: string;
  activityType: ActivityType;
  proposedTime?: string;
  venueName?: string;
  message?: string;
  requestId: string;
}

export const requestReceivedTemplate: EmailTemplate<RequestReceivedData> = (data): EmailContent => {
  const activity = activityWithArticle(data.activityType);
  const subject = `New ${activity} request from ${data.seekerName}`;
  const ctaHref = appUrl(`/requests/${data.requestId}`);

  const lineWhen = data.proposedTime
    ? `<p style="margin:0 0 8px;"><strong>When:</strong> ${escapeHtml(data.proposedTime)}</p>`
    : '';
  const lineWhere = data.venueName
    ? `<p style="margin:0 0 8px;"><strong>Where:</strong> ${escapeHtml(data.venueName)}</p>`
    : '';
  const lineMessage = data.message
    ? `<p style="margin:12px 0 0;padding:12px;background:#f3f4f6;border-radius:8px;">
         <em>"${escapeHtml(data.message)}"</em>
       </p>`
    : '';

  const html = layout({
    preheader: `${data.seekerName} would like to share ${activityLabel(data.activityType).toLowerCase()} with you.`,
    heading: `New ${activityLabel(data.activityType).toLowerCase()} request`,
    bodyHtml: `
      <p>Hi ${escapeHtml(data.companionName)},</p>
      <p>${escapeHtml(data.seekerName)} would like to share ${activityLabel(data.activityType).toLowerCase()} with you.</p>
      ${lineWhen}
      ${lineWhere}
      ${lineMessage}
      <p style="margin-top:16px;">Tap below to accept or decline.</p>
    `,
    ctaLabel: 'View request',
    ctaHref,
  });

  const text = plain(
    [
      `Hi ${data.companionName},`,
      `${data.seekerName} would like to share ${activityLabel(data.activityType).toLowerCase()} with you.`,
      data.proposedTime ? `When: ${data.proposedTime}` : '',
      data.venueName ? `Where: ${data.venueName}` : '',
      data.message ? `Message: "${data.message}"` : '',
    ].filter((s) => s.length > 0),
    { label: 'View request', href: ctaHref },
  );

  return { subject, html, text };
};
