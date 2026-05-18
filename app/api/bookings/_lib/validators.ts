// Zod validators for the bookings module.

import { z } from 'zod';
import { budgetTierSchema, isoTimestampSchema, uuidSchema } from '@/app/api/_lib/validators';

export const createBookingSchema = z.object({
  request_id: uuidSchema,
  venue_name: z.string().trim().min(1, 'Venue name is required.').max(200),
  venue_location: z.string().trim().min(1, 'Venue location is required.').max(400),
  scheduled_time: isoTimestampSchema,
  budget_tier: budgetTierSchema,
});

export type CreateBookingPayload = z.infer<typeof createBookingSchema>;
