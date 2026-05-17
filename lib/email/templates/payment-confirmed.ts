// Seeker receives this after Stripe confirms their payment intent.

import {
  appUrl,
  escapeHtml,
  layout,
  plain,
  type EmailContent,
  type EmailTemplate,
} from './_shared';

export interface PaymentConfirmedData {
  seekerName: string;
  /** Whole-dollar or formatted amount, e.g. "$22.00". Callers format. */
  feeDisplay: string;
  bookingId: string;
}

export const paymentConfirmedTemplate: EmailTemplate<PaymentConfirmedData> = (
  data,
): EmailContent => {
  const subject = 'Payment confirmed — your fee is held safely';
  const ctaHref = appUrl(`/bookings/${data.bookingId}`);

  const html = layout({
    preheader: 'We’ll release your fee to your companion once the activity is complete.',
    heading: 'Your payment is in',
    bodyHtml: `
      <p>Hi ${escapeHtml(data.seekerName)},</p>
      <p>We’ve received your companionship fee of <strong>${escapeHtml(data.feeDisplay)}</strong> and it’s held safely in escrow.</p>
      <p>The fee is released to your companion automatically after you mark the activity complete in the app.</p>
    `,
    ctaLabel: 'View booking',
    ctaHref,
  });

  const text = plain(
    [
      `Hi ${data.seekerName},`,
      `We’ve received your companionship fee of ${data.feeDisplay} and it’s held safely in escrow.`,
      'The fee is released to your companion automatically after you mark the activity complete in the app.',
    ],
    { label: 'View booking', href: ctaHref },
  );

  return { subject, html, text };
};
