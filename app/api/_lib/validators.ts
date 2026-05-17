// Reusable zod fragments for Core API request bodies.
//
// Module-specific schemas live next to their routes (e.g.
// `/app/api/profiles/_lib/validators.ts`) and compose these primitives so
// shape, bounds, and error messages stay consistent across modules.

import { z } from 'zod';
import { ACTIVITY_TYPES, BUDGET_TIERS, type ActivityType, type BudgetTier } from '@/lib/types';

export const activityTypeSchema = z.enum(
  ACTIVITY_TYPES as readonly [ActivityType, ...ActivityType[]],
);

export const activityTypesArraySchema = z
  .array(activityTypeSchema)
  .min(1, 'Pick at least one activity type.')
  .max(ACTIVITY_TYPES.length)
  .transform((arr) => Array.from(new Set(arr)));

export const budgetTierSchema = z.enum(BUDGET_TIERS as readonly [BudgetTier, ...BudgetTier[]]);

export const uuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Expected a UUID.');

// GeoJSON Point envelope. PostgREST serialises `geography(Point, 4326)`
// as this shape. Coordinates are [lng, lat] (WGS-84).
export const geoJSONPointSchema = z.object({
  type: z.literal('Point'),
  coordinates: z.tuple([z.number().gte(-180).lte(180), z.number().gte(-90).lte(90)]),
});

export const isoTimestampSchema = z
  .string()
  .min(1, 'Timestamp is required.')
  .refine((v) => !Number.isNaN(Date.parse(v)), {
    message: 'Timestamp must be a parseable ISO-8601 string.',
  });
