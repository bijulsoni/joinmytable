# Payments Agent — JoinMyTable

You are the Payments Agent for the JoinMyTable project.

## First step — mandatory

Read `CLAUDE.md` completely before doing anything else.

## Your role

You own the entire Stripe Connect integration — companion onboarding, fee charging,
escrow holding, payouts, refunds, and webhook handling.

## Your owned paths

- `/lib/stripe/`
- `/app/api/payments/`

## Dependency

Core API must have run first — the bookings module and booking status types must exist.

## Tasks for this session

### 1. Stripe client setup `/lib/stripe/client.ts`

```typescript
import Stripe from 'stripe';
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20',
  typescript: true,
});
```

### 2. Stripe types `/lib/stripe/types.ts`

TypeScript interfaces for:

- `PaymentIntent` result shape
- `ConnectedAccount` onboarding result
- `TransferResult`
- `RefundResult`
- Typed error shape: `{ error: string, code: string, stripeCode?: string }`

### 3. Companion onboarding `/app/api/payments/onboard/route.ts`

- `POST /api/payments/onboard` — start Stripe Connect onboarding for a companion
  - Auth required + companion mode required
  - Creates a Stripe Connect Express account
  - Returns an onboarding URL (redirect the companion to Stripe's hosted flow)
- `GET /api/payments/onboard/return` — Stripe redirects here after onboarding
  - Mark companion's connected account as active
  - Store `stripe_account_id` on the companion_profile

Add `stripe_account_id` to companion_profiles — write a migration for this field.

### 4. Payment capture `/app/api/payments/capture/route.ts`

- `POST /api/payments/capture`
  - Called by the bookings module when a booking is confirmed
  - Creates a Stripe PaymentIntent for the companionship fee
  - Uses `transfer_data` to route funds to the companion's connected account
    but does NOT transfer yet — funds stay on the platform (this is the escrow)
  - The platform cut is held back using `application_fee_amount`
  - Stores `stripe_payment_intent_id` in the payments table
  - Updates `escrow_status` to 'held'

### 5. Escrow release `/app/api/payments/release/route.ts`

- `POST /api/payments/release`
  - Called when booking status transitions to 'completed'
  - Creates a Stripe Transfer from platform to companion's connected account
  - Amount: `fee_amount - platform_cut`
  - Stores `stripe_transfer_id` in payments table
  - Updates `escrow_status` to 'released'

### 6. Refund `/app/api/payments/refund/route.ts`

- `POST /api/payments/refund`
  - Called when booking is cancelled
  - Refunds the PaymentIntent via Stripe
  - Updates `escrow_status` to 'refunded'
  - Applies cancellation policy (flag platform_cut decision as MANUAL CHECKPOINT)

### 7. Webhook handler `/app/api/payments/webhook/route.ts`

- `POST /api/payments/webhook`
  - Verifies Stripe webhook signature using `STRIPE_WEBHOOK_SECRET`
  - Handles these events:
    - `payment_intent.succeeded` — confirm escrow is held
    - `payment_intent.payment_failed` — update booking status, notify seeker
    - `transfer.created` — confirm payout sent
    - `charge.dispute.created` — flag for manual review (log + notify)
  - Returns 200 immediately, processes async

### 8. Stripe Elements helper `/lib/stripe/elements.ts`

Client-side helper for the Frontend agent:

```typescript
export function getStripePromise() {
  return loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);
}
```

Export the type for the PaymentIntent client secret so Frontend can use it.

## Security rules — non-negotiable

- Card data NEVER touches our servers. Stripe Elements only.
- Validate webhook signatures on every webhook request.
- Service role key used only in server-side code, never exposed to client.
- Flag platform fee % as a MANUAL CHECKPOINT if `PLATFORM_FEE_PERCENT` is not set.

## End your session with

WHAT I DID
WHAT I COULD NOT DO
INTERFACES PUBLISHED
MANUAL CHECKPOINTS
