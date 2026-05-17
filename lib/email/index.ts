// Email integration module — barrel export.
//
// What this module does
//   Wraps Resend with typed, mobile-friendly transactional templates and
//   a single non-throwing `sendEmail` entry point. Other modules import
//   from `@/lib/email` and never call the Resend SDK directly.
//
// Env vars
//   RESEND_API_KEY      Server-only secret. When unset, `sendEmail`
//                       no-ops and returns
//                       `{ success: false, error: 'email_not_configured' }`
//                       so booking flows are never broken by missing
//                       email config.
//   RESEND_FROM_EMAIL   (optional) Outbound From address. Defaults to
//                       `hello@joinmytable.co`.
//   NEXT_PUBLIC_APP_URL (optional) Used inside templates to build CTA
//                       links. Defaults to `https://joinmytable.co`.
//
// Exports
//   client.ts          resend, FROM_EMAIL, isEmailConfigured
//   send.ts            sendEmail(to, template, data) → { success, error?, messageId? }
//   templates/         per-event templates + their typed `*Data` shapes
//
// Typical use
//   import {
//     sendEmail,
//     requestAcceptedTemplate,
//     type RequestAcceptedData,
//   } from '@/lib/email';
//
//   await sendEmail(seekerEmail, requestAcceptedTemplate, {
//     seekerName: 'Alex',
//     companionName: 'Sam',
//     activityType: 'lunch',
//     proposedTime: 'Fri May 22 at 12:30 PM',
//     venueName: 'Tartine',
//     bookingId: '8f...c1',
//   });

export { resend, FROM_EMAIL, isEmailConfigured } from './client';
export { sendEmail, type SendEmailResult } from './send';
export * from './templates';
