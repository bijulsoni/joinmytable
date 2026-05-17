// Resend client + outbound-address constants.
//
// The Resend SDK does not call the network at construction time, so it
// is safe to instantiate at module load even when `RESEND_API_KEY` is
// missing (e.g. in unit tests or local dev). `sendEmail` checks for the
// key before issuing the request and bails out cleanly when unset.

import { Resend } from 'resend';

const RESEND_API_KEY = process.env.RESEND_API_KEY ?? '';

export const resend = new Resend(RESEND_API_KEY);

export const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? 'hello@joinmytable.co';

/** True only when the Resend API key is configured. */
export function isEmailConfigured(): boolean {
  return RESEND_API_KEY.length > 0;
}
