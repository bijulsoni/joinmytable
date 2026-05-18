// Zod validators for the requests module.

import { z } from 'zod';
import {
  activityTypeSchema,
  budgetTierSchema,
  isoTimestampSchema,
  uuidSchema,
} from '@/app/api/_lib/validators';

// venue_name + budget required so accept can auto-create the booking
// without a second seeker confirmation step. venue_location is optional
// (the UI marks it "optional" — neighborhood is nice-to-have but the
// venue name itself is the load-bearing field).
//
// Empty strings + nulls are tolerated on the optional fields so the
// frontend can submit `''` or `null` without 400ing.
const optionalText = (max: number) =>
  z
    .union([z.string().trim().max(max), z.null()])
    .optional()
    .transform((v) => (v === null || v === undefined || v === '' ? undefined : v));

export const createRequestSchema = z.object({
  companion_id: uuidSchema,
  activity_type: activityTypeSchema,
  proposed_time: isoTimestampSchema,
  venue_name: z.string().trim().min(1, 'Venue name is required.').max(200),
  venue_location: optionalText(400),
  budget_tier: budgetTierSchema,
  message: optionalText(2000),
});

export type CreateRequestPayload = z.infer<typeof createRequestSchema>;

export const updateRequestSchema = z.object({
  status: z.enum(['accepted', 'declined']),
});

export type UpdateRequestPayload = z.infer<typeof updateRequestSchema>;
