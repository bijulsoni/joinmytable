// Activity-type enum + metadata.
//
// Owner: Database agent.
//
// CLAUDE.md core product rule #1: only four activity types in the MVP.
// This file is the single source of truth for that union; importers must
// never compare against ad-hoc strings.
//
// Metadata (suggested duration, venue, fee range) mirrors the
// "Activity types" table in CLAUDE.md and is provided as a typed lookup
// so frontend copy and Core API validation can share one definition.

/**
 * The four MVP activity types. Stored as plain `text` in Postgres with a
 * `CHECK (activity_type IN (...))` constraint in every table that
 * references it (meal_requests, bookings, plus inside the jsonb maps on
 * companion_profiles.activities / .rates and the text[] on
 * availability.activity_types).
 */
export type ActivityType = 'lunch' | 'dinner' | 'coffee' | 'happy_hour';

export const ACTIVITY_TYPES: readonly ActivityType[] = [
  'lunch',
  'dinner',
  'coffee',
  'happy_hour',
] as const;

export function isActivityType(value: unknown): value is ActivityType {
  return typeof value === 'string' && (ACTIVITY_TYPES as readonly string[]).includes(value);
}

export interface ActivityTypeMeta {
  /** Stable enum value used in DB and API payloads. */
  value: ActivityType;
  /** Title-case label for UI. */
  label: string;
  /** Suggested duration range (minutes, inclusive). */
  durationMinutes: { min: number; max: number };
  /** Typical venue category (used for venue-picker hints). */
  venue: 'cafe' | 'restaurant' | 'bar_or_restaurant';
  /** Suggested fee range in whole dollars (companion-set, not enforced). */
  suggestedFeeUsd: { min: number; max: number };
}

export const ACTIVITY_TYPE_META: Readonly<Record<ActivityType, ActivityTypeMeta>> = {
  coffee: {
    value: 'coffee',
    label: 'Coffee / tea',
    durationMinutes: { min: 30, max: 60 },
    venue: 'cafe',
    suggestedFeeUsd: { min: 10, max: 15 },
  },
  lunch: {
    value: 'lunch',
    label: 'Lunch',
    durationMinutes: { min: 60, max: 90 },
    venue: 'restaurant',
    suggestedFeeUsd: { min: 20, max: 25 },
  },
  happy_hour: {
    value: 'happy_hour',
    label: 'Happy hour',
    durationMinutes: { min: 60, max: 120 },
    venue: 'bar_or_restaurant',
    suggestedFeeUsd: { min: 20, max: 25 },
  },
  dinner: {
    value: 'dinner',
    label: 'Dinner',
    durationMinutes: { min: 90, max: 120 },
    venue: 'restaurant',
    suggestedFeeUsd: { min: 20, max: 25 },
  },
} as const;
