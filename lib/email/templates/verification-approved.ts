// Companion's verification was approved by an admin.
//
// Sent from the admin verifications action on approve. Tier-aware:
//   basic → live in Explore, tagged "Basic" (still needs ID before a meet)
//   full  → "Verified" badge, can accept meets
// Plus a Founding Companion callout when applicable.

import {
  appUrl,
  escapeHtml,
  layout,
  plain,
  type EmailContent,
  type EmailTemplate,
} from './_shared';

export interface VerificationApprovedData {
  /** Injected automatically by notify() from the recipient's user row. */
  recipientName?: string;
  tier: 'basic' | 'full';
  founding?: boolean;
}

export const verificationApprovedTemplate: EmailTemplate<VerificationApprovedData> = (
  data,
): EmailContent => {
  const full = data.tier === 'full';
  const name = data.recipientName?.trim() || 'there';
  const subject = full ? "You're verified on Konnly ✓" : "You're live on Konnly 🎉";
  const ctaHref = appUrl('/discover');

  const tierLine = full
    ? `<p>Your profile is <strong>verified</strong> and live. Seekers can find you, request activities, and you can accept and confirm meets.</p>`
    : `<p>Your profile is <strong>live in Explore</strong>, tagged <strong>Basic</strong> — seekers can find and request you right away. One quick step before you can confirm your first meet: add a photo of your government ID (we'll ask when your first request comes in).</p>`;

  const foundingLine = data.founding
    ? `<p style="margin:12px 0 0;padding:12px;background:#fff1ea;border-radius:8px;">
         🌟 <strong>You're a Founding Companion</strong> — one of Konnly's first. That means
         <strong>no platform fee, ever</strong>. Thank you for being early.
       </p>`
    : '';

  const html = layout({
    preheader: full
      ? "You're verified — your Konnly profile is live."
      : "You're live in Explore on Konnly.",
    heading: full ? "You're verified ✓" : "You're live in Explore 🎉",
    bodyHtml: `
      <p>Hi ${escapeHtml(name)},</p>
      ${tierLine}
      ${foundingLine}
      <p style="margin-top:16px;">Welcome aboard.</p>
    `,
    ctaLabel: 'View Explore',
    ctaHref,
  });

  const text = plain(
    [
      `Hi ${name},`,
      full
        ? 'Your Konnly profile is verified and live. Seekers can request activities and you can accept meets.'
        : "Your Konnly profile is live in Explore, tagged Basic. Add a government ID before your first meet (we'll ask when your first request arrives).",
      data.founding
        ? "You're a Founding Companion — no platform fee, ever. Thank you for being early."
        : '',
    ].filter((s) => s.length > 0),
    { label: 'View Explore', href: ctaHref },
  );

  return { subject, html, text };
};
