// Zod validators for the profiles API.
//
// Every route handler validates its input with one of these schemas
// before touching the database. The bounds mirror the CHECK constraints
// declared in `supabase/migrations/20260515000200_users.sql` so the
// caller gets a clean 400 instead of a leaked Postgres error.

import { z } from 'zod';
import { MEAL_TYPES, type MealType } from '@/lib/types';

// ---------------------------------------------------------------------------
// Shared fragments
// ---------------------------------------------------------------------------

const mealTypeSchema = z.enum(MEAL_TYPES as readonly [MealType, ...MealType[]]);

const mealTypesArraySchema = z
  .array(mealTypeSchema)
  .min(1, 'Pick at least one meal type.')
  .max(MEAL_TYPES.length)
  .transform((arr) => Array.from(new Set(arr)));

const headlineSchema = z
  .string()
  .max(120, 'Headline must be 120 characters or fewer.')
  .trim()
  .nullable();

const bioLongSchema = z
  .string()
  .max(4000, 'Long bio must be 4000 characters or fewer.')
  .trim()
  .nullable();

// rate_cents: CHECK (rate_cents between 500 and 20000). Locked by the
// database; the API rejects out-of-band values up front.
const rateCentsSchema = z
  .number()
  .int('Rate must be a whole number of cents.')
  .min(500, 'Rate must be at least $5.00.')
  .max(20000, 'Rate must be no more than $200.00.');

// ISO 4217 currency code; column type is char(3). We only accept the
// uppercase form so the database stores a consistent shape.
const currencySchema = z
  .string()
  .regex(/^[A-Z]{3}$/, 'Currency must be a 3-letter ISO code (e.g. USD).');

// PostGIS geography(Point, 4326) is serialized as a GeoJSON Point by
// PostgREST. Validate the GeoJSON envelope and the WGS-84 ranges.
const geoJSONPointSchema = z.object({
  type: z.literal('Point'),
  coordinates: z.tuple([
    z.number().gte(-180).lte(180), // longitude
    z.number().gte(-90).lte(90), // latitude
  ]),
});

// service_radius_m: CHECK between 500 and 100000.
const serviceRadiusSchema = z
  .number()
  .int('Radius must be a whole number of meters.')
  .min(500, 'Service radius must be at least 500 meters.')
  .max(100_000, 'Service radius must be at most 100 km.');

// HH:MM or HH:MM:SS. Postgres `time` accepts seconds so we keep them
// optional. Rejecting at the API removes ambiguity for the Frontend.
const timeOfDaySchema = z
  .string()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/, 'Time must be in HH:MM or HH:MM:SS format.');

// IANA timezone string. We do a structural check; the database will
// reject anything Postgres cannot parse.
const timezoneSchema = z
  .string()
  .min(1, 'Timezone is required.')
  .max(64)
  .regex(
    /^[A-Za-z][A-Za-z0-9_+\-/]*$/,
    'Timezone must be an IANA identifier (e.g. America/Los_Angeles).',
  );

// ---------------------------------------------------------------------------
// Companion profile upsert
// ---------------------------------------------------------------------------
// PUT /api/profiles/me payload. All fields required (this is the
// representation of the resource, not a partial patch). The route
// handler upserts on (user_id).

export const companionProfileUpsertSchema = z.object({
  headline: headlineSchema.optional().default(null),
  bio_long: bioLongSchema.optional().default(null),
  rate_cents: rateCentsSchema,
  rate_currency: currencySchema.optional().default('USD'),
  meal_types: mealTypesArraySchema.optional().default(['lunch', 'dinner']),
  service_area_center: geoJSONPointSchema,
  service_radius_m: serviceRadiusSchema,
});

export type CompanionProfileUpsertInput = z.infer<typeof companionProfileUpsertSchema>;

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

export const availabilityCreateSchema = z
  .object({
    day_of_week: z.number().int().min(0).max(6, 'Day of week must be 0 (Sun) - 6 (Sat).'),
    start_time: timeOfDaySchema,
    end_time: timeOfDaySchema,
    meal_type: mealTypeSchema,
    timezone: timezoneSchema,
  })
  .refine((v) => v.end_time > v.start_time, {
    message: 'end_time must be after start_time.',
    path: ['end_time'],
  });

export type AvailabilityCreateInput = z.infer<typeof availabilityCreateSchema>;

// Updates are partial; we re-validate the start/end ordering when both
// are present so a partial patch cannot land an invalid window.
export const availabilityUpdateSchema = z
  .object({
    day_of_week: z.number().int().min(0).max(6).optional(),
    start_time: timeOfDaySchema.optional(),
    end_time: timeOfDaySchema.optional(),
    meal_type: mealTypeSchema.optional(),
    timezone: timezoneSchema.optional(),
  })
  .refine(
    (v) => v.start_time === undefined || v.end_time === undefined || v.end_time > v.start_time,
    { message: 'end_time must be after start_time.', path: ['end_time'] },
  )
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: 'Provide at least one field to update.',
  });

export type AvailabilityUpdateInput = z.infer<typeof availabilityUpdateSchema>;

// ---------------------------------------------------------------------------
// Photo reference
// ---------------------------------------------------------------------------
// The Auth & Identity agent owns avatar uploads (see lib/auth/storage.ts):
// `uploadAvatar` writes a `<userId>/avatar-<ts>.<ext>` object into the
// `avatars` bucket AND sets users.avatar_path to that key. This endpoint
// exists for the lower-traffic case of re-pointing avatar_path at an
// already-uploaded object (or clearing it) without re-uploading.

export const photoSetSchema = z.object({
  avatar_path: z.string().min(1, 'avatar_path is required.').max(512, 'avatar_path is too long.'),
});

export type PhotoSetInput = z.infer<typeof photoSetSchema>;

// ---------------------------------------------------------------------------
// UUID path params
// ---------------------------------------------------------------------------

export const uuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Expected a UUID.');
