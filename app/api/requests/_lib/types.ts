// Wire shapes for the requests module. Frozen contract.

import type { ActivityType, BudgetTier, RequestStatus } from '@/lib/types';

export interface MealRequestDTO {
  id: string;
  seeker_id: string;
  companion_id: string;
  activity_type: ActivityType;
  proposed_time: string;
  venue_name: string | null;
  venue_location: string | null;
  budget_tier: BudgetTier | null;
  message: string | null;
  status: RequestStatus;
  created_at: string;
  /**
   * Joined counterpart name. Populated on GET; null on POST response
   * (caller already knows who they sent to).
   */
  counterpart_name: string | null;
  /** Booking id if this accepted request has spawned a booking. */
  booking_id: string | null;
}

export interface MealRequestRow {
  id: string;
  seeker_id: string;
  companion_id: string;
  activity_type: ActivityType;
  proposed_time: string;
  venue_name: string | null;
  venue_location: string | null;
  budget_tier: BudgetTier | null;
  message: string | null;
  status: RequestStatus;
  created_at: string;
}
