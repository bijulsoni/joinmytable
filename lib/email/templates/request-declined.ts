// Seeker is notified that their request was declined.

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

export interface RequestDeclinedData {
  seekerName: string;
  companionName: string;
  activityType: ActivityType;
}

export const requestDeclinedTemplate: EmailTemplate<RequestDeclinedData> = (data): EmailContent => {
  const subject = `Update on your ${activityWithArticle(data.activityType)} request`;
  const ctaHref = appUrl('/discover');

  const html = layout({
    preheader: `${data.companionName} can’t make this one work.`,
    heading: 'A small update',
    bodyHtml: `
      <p>Hi ${escapeHtml(data.seekerName)},</p>
      <p>${escapeHtml(data.companionName)} isn’t able to take your ${activityLabel(data.activityType).toLowerCase()} request this time.</p>
      <p>Plenty of other companions are available — take a look at who’s nearby.</p>
    `,
    ctaLabel: 'Find another companion',
    ctaHref,
  });

  const text = plain(
    [
      `Hi ${data.seekerName},`,
      `${data.companionName} isn’t able to take your ${activityLabel(data.activityType).toLowerCase()} request this time.`,
      'Plenty of other companions are available — take a look at who’s nearby.',
    ],
    { label: 'Find another companion', href: ctaHref },
  );

  return { subject, html, text };
};
