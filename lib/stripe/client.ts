import 'server-only';

// Stripe server client.
//
// Lazy + null-safe like the Resend client: returns null when
// STRIPE_SECRET_KEY isn't configured, so the app runs locally without
// payments wired. Every caller checks isStripeConfigured() / a null
// return before use.

import Stripe from 'stripe';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? '';

let cached: Stripe | null = null;

export function getStripe(): Stripe | null {
  if (!STRIPE_SECRET_KEY) return null;
  if (cached) return cached;
  // Pin no apiVersion → use the SDK's default (matches the installed
  // major). Avoids drift between dashboard + SDK.
  cached = new Stripe(STRIPE_SECRET_KEY);
  return cached;
}

export function isStripeConfigured(): boolean {
  return STRIPE_SECRET_KEY.length > 0;
}

export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? '';
