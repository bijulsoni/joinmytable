// Wire shapes for the bookings module.

import type { ActivityType, BookingStatus, BudgetTier, EscrowStatus } from '@/lib/types';

export interface BookingDTO {
  id: string;
  request_id: string;
  activity_type: ActivityType;
  venue_name: string;
  venue_location: string;
  scheduled_time: string;
  budget_tier: BudgetTier;
  companion_fee: number;
  status: BookingStatus;
  created_at: string;
  seeker_id: string;
  companion_id: string;
  counterpart_name: string | null;
  /** See note on MealRequestDTO.counterpart_photo_urls. */
  counterpart_photo_urls: string[];
  escrow_status: EscrowStatus | null;
}

export interface BookingRow {
  id: string;
  request_id: string;
  activity_type: ActivityType;
  venue_name: string;
  venue_location: string;
  scheduled_time: string;
  budget_tier: BudgetTier;
  companion_fee: string | number;
  status: BookingStatus;
  created_at: string;
}
