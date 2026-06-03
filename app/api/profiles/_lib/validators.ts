// Zod validators for the profiles API.
//
// Every profile route handler validates its input with one of these
// schemas before touching the database. Bounds reflect the CLAUDE.md
// "Activity types" suggested-fee ranges (loose validation here; the
// companion can set any positive whole-dollar rate).

import { z } from 'zod';
import {
  ACTIVITY_TYPES,
  type ActivityType,
  type CompanionActivitiesMap,
  type CompanionRatesMap,
} from '@/lib/types';
import { activityTypesArraySchema, geoJSONPointSchema } from '@/app/api/_lib/validators';

// ---------------------------------------------------------------------------
// Shared fragments
// ---------------------------------------------------------------------------

const bioSchema = z.string().max(4000, 'Bio must be 4000 characters or fewer.').trim().nullable();

const serviceAreaSchema = z
  .string()
  .max(200, 'Service area must be 200 characters or fewer.')
  .trim()
  .nullable();

// activities is a jsonb map of ActivityType -> boolean. We accept any
// subset of the four allowed keys; unrecognised keys are stripped.
const activitiesMapSchema = z
  .record(z.string(), z.boolean())
  .transform((raw): CompanionActivitiesMap => {
    const out: CompanionActivitiesMap = {};
    for (const key of ACTIVITY_TYPES) {
      const v = raw[key];
      if (typeof v === 'boolean') out[key] = v;
    }
    return out;
  });

// rates is a jsonb map of ActivityType -> whole-dollar number. Bounds
// are loose (the suggested ranges in CLAUDE.md are advisory, not
// enforced); we just clamp to "positive integer, reasonable cap".
const rateValueSchema = z
  .number()
  .int('Rate must be a whole number of dollars.')
  .min(1, 'Rate must be at least $1.')
  .max(500, 'Rate must be no more than $500.');

const ratesMapSchema = z.record(z.string(), rateValueSchema).transform((raw): CompanionRatesMap => {
  const out: CompanionRatesMap = {};
  for (const key of ACTIVITY_TYPES) {
    const v = raw[key];
    if (typeof v === 'number') out[key] = v;
  }
  return out;
});

// Single photo URL.  Companion uploads pass through Supabase Storage /
// Auth uploader; this endpoint stores the resolved URL.
const photoUrlSchema = z
  .string()
  .url('Photo must be a valid URL.')
  .max(2048, 'Photo URL is too long.');

// ---------------------------------------------------------------------------
// Companion profile upsert
// ---------------------------------------------------------------------------
// PUT /api/profiles/me payload. Whole-resource write per the contract,
// but every column is optional on the wire so the Frontend can drip-fill
// during onboarding without losing existing values.

export const companionProfileUpsertSchema = z
  .object({
    bio: bioSchema.optional(),
    service_area: serviceAreaSchema.optional(),
    location: geoJSONPointSchema.nullable().optional(),
    activities: activitiesMapSchema.optional(),
    rates: ratesMapSchema.optional(),
    payout_method: z.enum(['venmo', 'zelle', 'paypal']).nullable().optional(),
    payout_handle: z.string().trim().max(120).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field.',
  });

export type CompanionProfileUpsertInput = z.infer<typeof companionProfileUpsertSchema>;

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------
// day_or_date and time_range are free-form text per CLAUDE.md; the API
// validates non-empty trimmed strings and an `activity_types` array
// drawn from the four allowed values.

const dayOrDateSchema = z
  .string()
  .trim()
  .min(1, 'day_or_date is required.')
  .max(40, 'day_or_date must be 40 characters or fewer.');

const timeRangeSchema = z
  .string()
  .trim()
  .min(1, 'time_range is required.')
  .max(40, 'time_range must be 40 characters or fewer.');

export const availabilityCreateSchema = z.object({
  day_or_date: dayOrDateSchema,
  time_range: timeRangeSchema,
  activity_types: activityTypesArraySchema,
});

export type AvailabilityCreateInput = z.infer<typeof availabilityCreateSchema>;

export const availabilityUpdateSchema = z
  .object({
    day_or_date: dayOrDateSchema.optional(),
    time_range: timeRangeSchema.optional(),
    activity_types: activityTypesArraySchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update.',
  });

export type AvailabilityUpdateInput = z.infer<typeof availabilityUpdateSchema>;

// ---------------------------------------------------------------------------
// Photo endpoints
// ---------------------------------------------------------------------------
// New schema stores `photo_urls text[]` on companion_profiles. POST
// appends a URL, DELETE removes one by exact match.

export const photoAddSchema = z.object({
  url: photoUrlSchema,
});

export type PhotoAddInput = z.infer<typeof photoAddSchema>;

export const photoRemoveSchema = z.object({
  url: photoUrlSchema,
});

export type PhotoRemoveInput = z.infer<typeof photoRemoveSchema>;

// ---------------------------------------------------------------------------
// Re-exports for convenience
// ---------------------------------------------------------------------------

export { uuidSchema } from '@/app/api/_lib/validators';

/** Subset of ACTIVITY_TYPES re-exported so consumers can build pickers. */
export const SUPPORTED_ACTIVITY_TYPES: readonly ActivityType[] = ACTIVITY_TYPES;
