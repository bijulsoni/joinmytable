// Database enum string-literal types.
//
// Owner: Database agent.
//
// These mirror the CHECK constraints in `supabase/migrations/` exactly.
// CLAUDE.md "Status enums" is the source of truth; this file is the TS
// projection. When a CHECK constraint changes, update this file in the
// same PR as the migration.
//
// Note: the Postgres schema models statuses as `text` with CHECK
// constraints (not Postgres ENUM types). This file therefore declares
// string-literal unions, not generated enum types.

import type { ActivityType } from './activity';

/** Re-export so importers can grab either `ActivityType` or the alias from one place. */
export type { ActivityType } from './activity';
export { ACTIVITY_TYPES, ACTIVITY_TYPE_META, isActivityType } from './activity';

/** meal_requests.status — lifecycle ends here or in bookings.status. */
export type RequestStatus = 'requested' | 'accepted' | 'declined';

export const REQUEST_STATUSES: readonly RequestStatus[] = [
  'requested',
  'accepted',
  'declined',
] as const;

/** bookings.status — post-acceptance lifecycle. */
export type BookingStatus = 'confirmed' | 'completed' | 'cancelled';

export const BOOKING_STATUSES: readonly BookingStatus[] = [
  'confirmed',
  'completed',
  'cancelled',
] as const;

/** payments.escrow_status — companionship fee custody. */
export type EscrowStatus = 'held' | 'released' | 'refunded';

export const ESCROW_STATUSES: readonly EscrowStatus[] = ['held', 'released', 'refunded'] as const;

/** users.verification_status — seeker-side identity gate. */
export type VerificationStatus = 'unverified' | 'pending' | 'verified';

export const VERIFICATION_STATUSES: readonly VerificationStatus[] = [
  'unverified',
  'pending',
  'verified',
] as const;

/** Seeker-chosen activity-cost cap (CLAUDE.md core product rule #5). */
export type BudgetTier = '$' | '$$' | '$$$';

export const BUDGET_TIERS: readonly BudgetTier[] = ['$', '$$', '$$$'] as const;

/**
 * Human-readable per-person budget ranges for the activity bill (the
 * venue tab — does NOT include the companion fee). Calibrated for US
 * metros; shown in the request composer so the seeker isn't guessing
 * what `$$$` means, and on the request/booking row so the companion
 * sees what to expect.
 *
 * Ranges nailed down with the founder; see commit history for the
 * conversation behind each cell.
 */
export const BUDGET_TIER_RANGES: Readonly<Record<ActivityType, Record<BudgetTier, string>>> = {
  coffee: {
    $: 'Under $10',
    $$: '$10–20',
    $$$: '$20+',
  },
  lunch: {
    $: 'Under $20',
    $$: '$20–40',
    $$$: '$40+',
  },
  happy_hour: {
    $: 'Under $25',
    $$: '$25–50',
    $$$: '$50+',
  },
  dinner: {
    $: 'Under $30',
    $$: '$30–60',
    $$$: '$60+',
  },
};

export function budgetRangeLabel(activity: ActivityType, tier: BudgetTier): string {
  return BUDGET_TIER_RANGES[activity][tier];
}

// ---------------------------------------------------------------------------
// Allowed lifecycle transitions
// ---------------------------------------------------------------------------
// Authoritative enforcement lives in the Core API; this map is exported so
// the frontend can pre-validate UI state without round-tripping.

/**
 * meal_requests.status transitions:
 *   requested -> accepted | declined
 *   accepted / declined are terminal (acceptance spawns a bookings row;
 *   subsequent state is on the booking, not the request).
 */
export const REQUEST_NEXT_STATES: Readonly<Record<RequestStatus, readonly RequestStatus[]>> = {
  requested: ['accepted', 'declined'],
  accepted: [],
  declined: [],
} as const;

/**
 * bookings.status transitions:
 *   confirmed -> completed | cancelled
 *   completed / cancelled are terminal.
 *
 *   completed  -> escrow releases, reviews unlock (core product rules #7, #9).
 *   cancelled  -> escrow refunds.
 */
export const BOOKING_NEXT_STATES: Readonly<Record<BookingStatus, readonly BookingStatus[]>> = {
  confirmed: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
} as const;

export type Activity = ActivityType;
