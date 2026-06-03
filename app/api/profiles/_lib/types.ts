// Wire shapes for the profiles API.
//
// Owner: Core API agent. Stable view-models layered on top of database
// rows; we never return raw `*Row` objects so we can omit internal
// columns (created_at, photo_urls writability quirks, etc.) without
// breaking consumers.
//
// Frozen against the CLAUDE.md schema (Phase 1 v2):
//   - companion_profiles uses bio (text), service_area (text),
//     location (GeoJSON Point | null), activities (jsonb map keyed by
//     ActivityType -> boolean), rates (jsonb map keyed by ActivityType
//     -> number USD), photo_urls (text[]), rating_avg (decimal string).
//   - users carries name (not display_name) and verification_status; no
//     avatar_path column.
//   - availability uses companion_profile_id (FK to companion_profiles.id),
//     day_or_date / time_range as free-form text, activity_types text[].

import type {
  ActivityType,
  AvailabilityRow,
  CompanionActivitiesMap,
  CompanionProfileRow,
  CompanionRatesMap,
  GeoJSONPoint,
  UserRow,
  VerificationStatus,
} from '@/lib/types';

// ---------------------------------------------------------------------------
// Companion profile DTOs
// ---------------------------------------------------------------------------

/**
 * Owner-facing view of the signed-in user's companion profile. Includes
 * everything the profile-setup screen needs in a single round-trip.
 */
export interface OwnCompanionProfileDTO {
  user_id: string;
  name: string;
  email: string;
  is_seeker: boolean;
  is_companion: boolean;
  /** Seeker-side verification (mirrors users.verification_status). */
  account_verification_status: VerificationStatus;
  bio: string | null;
  service_area: string | null;
  location: GeoJSONPoint | null;
  /** Activity-keyed booleans (lunch/dinner/coffee/happy_hour). */
  activities: CompanionActivitiesMap;
  /** Activity-keyed whole-dollar rates (companion-set, suggested ranges in CLAUDE.md). */
  rates: CompanionRatesMap;
  photo_urls: string[];
  /** decimal(3,2) — serialized as string by PostgREST. */
  rating_avg: string;
  /** ISO timestamp when the companion profile was approved; null = unverified. */
  verified_at: string | null;
  /** True only for full government-ID verification ("Verified" badge);
   *  false = basic/selfie-only ("Basic"). Lets the owner's own profile
   *  screen distinguish the two verified tiers and link to the ID step. */
  fully_verified: boolean;
  /** Payout details (own view only). How the companion gets paid. */
  payout_method: string | null;
  payout_handle: string | null;
  created_at: string;
}

/**
 * Public-facing view rendered on `/companions/[id]`. Only verified
 * companions are surfaced (RLS enforces this; the route returns 404
 * otherwise). Strips owner-only fields (no email, no is_seeker flag).
 */
export interface PublicCompanionProfileDTO {
  user_id: string;
  name: string;
  bio: string | null;
  service_area: string | null;
  location: GeoJSONPoint | null;
  activities: CompanionActivitiesMap;
  rates: CompanionRatesMap;
  photo_urls: string[];
  rating_avg: string;
  /** True only for full government-ID verification ("Verified" badge);
   *  false = basic/selfie-only ("Basic"). */
  fully_verified: boolean;
  /** Founding Companion (first 100) — shows a Founding badge. */
  is_founding: boolean;
  availability: AvailabilityDTO[];
}

/** One availability window. day_or_date / time_range are free-form text
 * per CLAUDE.md so callers can express recurring ("Mon", "weekdays") or
 * one-off ("2026-06-04") slots without a schema change. */
export interface AvailabilityDTO {
  id: string;
  day_or_date: string;
  time_range: string;
  activity_types: ActivityType[];
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function normalizeActivities(value: CompanionActivitiesMap | null): CompanionActivitiesMap {
  return value ?? {};
}

function normalizeRates(value: CompanionRatesMap | null): CompanionRatesMap {
  return value ?? {};
}

function normalizePhotos(value: string[] | null): string[] {
  return value ?? [];
}

export function toOwnCompanionProfileDTO(
  profile: CompanionProfileRow,
  user: Pick<
    UserRow,
    'id' | 'name' | 'email' | 'is_seeker' | 'is_companion' | 'verification_status'
  >,
): OwnCompanionProfileDTO {
  return {
    user_id: profile.user_id ?? user.id,
    name: user.name,
    email: user.email,
    is_seeker: user.is_seeker,
    is_companion: user.is_companion,
    account_verification_status: user.verification_status,
    bio: profile.bio,
    service_area: profile.service_area,
    location: profile.location,
    activities: normalizeActivities(profile.activities),
    rates: normalizeRates(profile.rates),
    photo_urls: normalizePhotos(profile.photo_urls),
    rating_avg: profile.rating_avg,
    verified_at: profile.verified_at,
    fully_verified: profile.id_verified_at !== null,
    payout_method: profile.payout_method,
    payout_handle: profile.payout_handle,
    created_at: profile.created_at,
  };
}

export function toPublicCompanionProfileDTO(
  profile: CompanionProfileRow,
  user: Pick<UserRow, 'id' | 'name'>,
  availability: AvailabilityRow[],
): PublicCompanionProfileDTO {
  return {
    user_id: profile.user_id ?? user.id,
    name: user.name,
    bio: profile.bio,
    service_area: profile.service_area,
    location: profile.location,
    activities: normalizeActivities(profile.activities),
    rates: normalizeRates(profile.rates),
    photo_urls: normalizePhotos(profile.photo_urls),
    rating_avg: profile.rating_avg,
    fully_verified: profile.id_verified_at !== null,
    is_founding: profile.is_founding === true,
    availability: availability.map(toAvailabilityDTO),
  };
}

export function toAvailabilityDTO(row: AvailabilityRow): AvailabilityDTO {
  return {
    id: row.id,
    day_or_date: row.day_or_date,
    time_range: row.time_range,
    activity_types: row.activity_types ?? [],
  };
}
