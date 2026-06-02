// Resend client + outbound-address constants.
//
// The Resend SDK *does* throw at construction time when passed an empty
// API key (despite older docs). To keep local dev usable when the key
// isn't configured, we lazy-instantiate the client and route every
// caller through `getResend()` — which returns null when unconfigured.
// `sendEmail` already short-circuits when `isEmailConfigured()` is
// false, so no live caller will ever ask for the client without a key.

import { Resend } from 'resend';

const RESEND_API_KEY = process.env.RESEND_API_KEY ?? '';

let cached: Resend | null = null;

/** Returns a Resend client, or null when no API key is configured. */
export function getResend(): Resend | null {
  if (!RESEND_API_KEY) return null;
  if (cached) return cached;
  cached = new Resend(RESEND_API_KEY);
  return cached;
}

// Back-compat for callers that imported the eager singleton. Equals null
// when no key is configured. Prefer getResend() at call sites.
export const resend = (() => {
  try {
    return RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;
  } catch {
    return null;
  }
})() as Resend | null;

// `RESEND_FROM` is the documented var (see docs/SETUP-resend-stripe.md) and
// accepts the "Name <email>" form. RESEND_FROM_EMAIL is kept as a fallback
// for any older config. Default points at the verified konnly.com domain.
export const FROM_EMAIL =
  process.env.RESEND_FROM ?? process.env.RESEND_FROM_EMAIL ?? 'Konnly <hello@konnly.com>';

/** True only when the Resend API key is configured. */
export function isEmailConfigured(): boolean {
  return RESEND_API_KEY.length > 0;
}
