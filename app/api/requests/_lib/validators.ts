// Zod validators for the requests module.

import { z } from 'zod';
import {
  activityTypeSchema,
  budgetTierSchema,
  isoTimestampSchema,
  uuidSchema,
} from '@/app/api/_lib/validators';

// Venue + budget required at request time so accept can auto-create the
// booking without a second seeker confirmation step.
export const createRequestSchema = z.object({
  companion_id: uuidSchema,
  activity_type: activityTypeSchema,
  proposed_time: isoTimestampSchema,
  venue_name: z.string().trim().min(1, 'Venue name is required.').max(200),
  venue_location: z.string().trim().min(1, 'Venue location is required.').max(400),
  budget_tier: budgetTierSchema,
  message: z.string().trim().max(2000).optional(),
});

export type CreateRequestPayload = z.infer<typeof createRequestSchema>;

export const updateRequestSchema = z.object({
  status: z.enum(['accepted', 'declined']),
});

export type UpdateRequestPayload = z.infer<typeof updateRequestSchema>;
