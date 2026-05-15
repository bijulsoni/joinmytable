// Wire shapes for the profiles API.
//
// The Frontend agent should import these for response typing. They are
// stable view-models layered on top of the database rows; we never
// return raw `*Row` objects so that we can omit internal columns
// (timestamps, denormalized scaffolding) without breaking consumers.

import type {
  AvailabilityRow,
  CompanionProfileRow,
  GeoJSONPoint,
  MealType,
  UserRow,
  VerificationStatus,
} from '@/lib/types';

/**
 * Shape returned for the authenticated companion's own profile - includes
 * everything the owner needs to render the profile-setup screen.
 */
export interface OwnCompanionProfileDTO {
  user_id: string;
  display_name: string;
  email: string;
  avatar_path: string | null;
  headline: string | null;
  bio_long: string | null;
  rate_cents: number;
  rate_currency: string;
  meal_types: MealType[];
  service_area_center: GeoJSONPoint;
  service_radius_m: number;
  verification_status: VerificationStatus;
  verified_at: string | null;
  avg_rating: number | null;
  rating_count: number;
  created_at: string;
  updated_at: string;
}

/**
 * Public view of a companion - what we render on
 * `/companions/[id]`. Strips owner-only fields (Stripe connect ids,
 * email, etc.). Only verified companions are surfaced; the route returns
 * 404 otherwise (RLS already filters them out at the DB layer).
 */
export interface PublicCompanionProfileDTO {
  user_id: string;
  display_name: string;
  avatar_path: string | null;
  headline: string | null;
  bio_long: string | null;
  rate_cents: number;
  rate_currency: string;
  meal_types: MealType[];
  service_area_center: GeoJSONPoint;
  service_radius_m: number;
  avg_rating: number | null;
  rating_count: number;
  availability: AvailabilityDTO[];
}

export interface AvailabilityDTO {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  meal_type: MealType;
  timezone: string;
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

export function toOwnCompanionProfileDTO(
  profile: CompanionProfileRow,
  user: Pick<UserRow, 'display_name' | 'email' | 'avatar_path'>,
): OwnCompanionProfileDTO {
  return {
    user_id: profile.user_id,
    display_name: user.display_name,
    email: user.email,
    avatar_path: user.avatar_path,
    headline: profile.headline,
    bio_long: profile.bio_long,
    rate_cents: profile.rate_cents,
    rate_currency: profile.rate_currency,
    meal_types: profile.meal_types,
    service_area_center: profile.service_area_center,
    service_radius_m: profile.service_radius_m,
    verification_status: profile.verification_status,
    verified_at: profile.verified_at,
    avg_rating: profile.avg_rating,
    rating_count: profile.rating_count,
    created_at: profile.created_at,
    updated_at: profile.updated_at,
  };
}

export function toPublicCompanionProfileDTO(
  profile: CompanionProfileRow,
  user: Pick<UserRow, 'display_name' | 'avatar_path'>,
  availability: AvailabilityRow[],
): PublicCompanionProfileDTO {
  return {
    user_id: profile.user_id,
    display_name: user.display_name,
    avatar_path: user.avatar_path,
    headline: profile.headline,
    bio_long: profile.bio_long,
    rate_cents: profile.rate_cents,
    rate_currency: profile.rate_currency,
    meal_types: profile.meal_types,
    service_area_center: profile.service_area_center,
    service_radius_m: profile.service_radius_m,
    avg_rating: profile.avg_rating,
    rating_count: profile.rating_count,
    availability: availability.map(toAvailabilityDTO),
  };
}

export function toAvailabilityDTO(row: AvailabilityRow): AvailabilityDTO {
  return {
    id: row.id,
    day_of_week: row.day_of_week,
    start_time: row.start_time,
    end_time: row.end_time,
    meal_type: row.meal_type,
    timezone: row.timezone,
  };
}
