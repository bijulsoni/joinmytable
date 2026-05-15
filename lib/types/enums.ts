// Database enum string-literal types.
//
// Owner: Database agent.
//
// These mirror the Postgres enums defined in
// `supabase/migrations/20260515000100_init.sql`. They are the single
// source of truth for status strings across the codebase: never compare
// against ad-hoc strings - always import from here.
//
// When a Postgres enum value is added/removed, update this file in the
// same PR as the migration.

export type MealType = 'lunch' | 'dinner';
export const MEAL_TYPES: readonly MealType[] = ['lunch', 'dinner'] as const;

export type VerificationStatus =
  | 'unverified'
  | 'pending'
  | 'verified'
  | 'rejected';

export type RequestStatus =
  | 'requested'
  | 'accepted'
  | 'declined'
  | 'cancelled'
  | 'expired';

export type BookingStatus =
  | 'accepted'
  | 'confirmed'
  | 'completed'
  | 'cancelled';

export type BudgetTier = 'low' | 'medium' | 'high';

export type PaymentStatus =
  | 'pending'
  | 'requires_action'
  | 'authorized'
  | 'captured'
  | 'released'
  | 'refunded'
  | 'failed';

export type EscrowStatus = 'pending' | 'held' | 'released' | 'refunded';

export type MessageType = 'user' | 'system';

export type ReviewSubjectType = 'companion' | 'seeker';

export type CancellationParty = 'seeker' | 'companion' | 'system';

// Booking lifecycle transitions allowed by the product spec. The Core API
// is the authoritative enforcer; this map exists so the frontend can pre-
// validate UI state.
export const BOOKING_NEXT_STATES: Record<BookingStatus, readonly BookingStatus[]> = {
  accepted: ['confirmed', 'cancelled'],
  confirmed: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
} as const;

export const REQUEST_NEXT_STATES: Record<RequestStatus, readonly RequestStatus[]> = {
  requested: ['accepted', 'declined', 'cancelled', 'expired'],
  accepted: [],
  declined: [],
  cancelled: [],
  expired: [],
} as const;
