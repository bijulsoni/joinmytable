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
  /**
   * Counterpart's photo gallery (from their companion_profiles.photo_urls).
   * Empty if they haven't uploaded any. Read via service-role on the
   * server because the seeker's companion_profiles row is typically not
   * verified (visible only to themselves by RLS), but the row IS part
   * of the same request transaction so it's legitimate to surface.
   */
  counterpart_photo_urls: string[];
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
