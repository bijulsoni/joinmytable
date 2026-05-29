// Database row / insert / update shapes.
//
// Owner: Database agent.
//
// Hand-authored mirror of `supabase/migrations/`. Columns, nullability,
// and defaults match the migrations verbatim (and CLAUDE.md "Database
// schema" by extension). Until `supabase gen types typescript` is wired
// up post-provisioning, this file IS the TS contract.
//
// Conventions:
//   - Every table appears as `Tables['<name>']` with Row / Insert / Update.
//   - `Row` reflects what the database returns (NULL → TS `null`).
//   - `Insert` marks NOT-NULL columns without a server default as required;
//     everything else is optional (DB will fill in or accept NULL).
//   - `Update` is `Partial<Row>` — caller specifies what to change.
//   - `decimal(10,2)` columns are typed as `string` because PostgREST
//     serialises numeric/decimal as JSON strings to preserve precision.
//   - `geography(Point, 4326)` columns come back from PostgREST as GeoJSON
//     Point objects; see `GeoJSONPoint` below.
//   - String enums imported from `./enums`; never inlined.

import type {
  ActivityType,
  BookingStatus,
  BudgetTier,
  EscrowStatus,
  RequestStatus,
  VerificationStatus,
  Gender,
} from './enums';

/** GeoJSON Point as returned by PostgREST for `geography(Point, 4326)`. */
export interface GeoJSONPoint {
  type: 'Point';
  /** [longitude, latitude] */
  coordinates: [number, number];
}

/** Loose JSON value used for jsonb columns. */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

/** Activity-keyed booleans for `companion_profiles.activities`. */
export type CompanionActivitiesMap = Partial<Record<ActivityType, boolean>>;

/** Activity-keyed whole-dollar rates for `companion_profiles.rates`. */
export type CompanionRatesMap = Partial<Record<ActivityType, number>>;

/**
 * Insert shape: NOT NULL columns without a server-side default are
 * required; everything else is optional (database default or NULLABLE).
 */
type Insert<R, Required extends keyof R> = Pick<R, Required> & Partial<Omit<R, Required>>;

// ---------------------------------------------------------------------------
// users
// ---------------------------------------------------------------------------
// Mirrors auth.users 1:1 (FK on id). Single account with seeker and/or
// companion mode flags (core product rule #6).

export interface UserRow {
  id: string;
  email: string;
  name: string;
  is_seeker: boolean;
  is_companion: boolean;
  verification_status: VerificationStatus;
  /** Own gender. Null = prefer not to say. Soft ranking signal only. */
  gender: Gender | null;
  /** Genders the user wants to meet. Null/empty = open to all. */
  interested_in: Gender[] | null;
  /** Null until the user finishes the /welcome onboarding flow. */
  onboarded_at: string | null;
  created_at: string;
}

export type UserInsert = Insert<UserRow, 'id' | 'email' | 'name'>;
export type UserUpdate = Partial<UserRow>;

// ---------------------------------------------------------------------------
// companion_profiles
// ---------------------------------------------------------------------------
// One row per companion. activities and rates are jsonb maps keyed by
// ActivityType. location is geography(Point, 4326) and is queried via the
// GiST index in 000500 for discovery.

export interface CompanionProfileRow {
  id: string;
  user_id: string | null;
  bio: string | null;
  service_area: string | null;
  location: GeoJSONPoint | null;
  activities: CompanionActivitiesMap | null;
  rates: CompanionRatesMap | null;
  photo_urls: string[] | null;
  rating_avg: string;
  verified_at: string | null;
  created_at: string;
}

export type CompanionProfileInsert = Insert<CompanionProfileRow, 'user_id'>;
export type CompanionProfileUpdate = Partial<CompanionProfileRow>;

// ---------------------------------------------------------------------------
// availability
// ---------------------------------------------------------------------------
// Free-form day_or_date / time_range per CLAUDE.md so callers may express
// recurring ("Mon", "weekdays") or one-off ("2026-06-04") slots without
// schema changes. The Core API normalises before persisting.

export interface AvailabilityRow {
  id: string;
  companion_profile_id: string | null;
  day_or_date: string;
  time_range: string;
  activity_types: ActivityType[] | null;
}

export type AvailabilityInsert = Insert<AvailabilityRow, 'day_or_date' | 'time_range'>;
export type AvailabilityUpdate = Partial<AvailabilityRow>;

// ---------------------------------------------------------------------------
// meal_requests
// ---------------------------------------------------------------------------

export interface MealRequestRow {
  id: string;
  seeker_id: string | null;
  companion_id: string | null;
  activity_type: ActivityType;
  proposed_time: string;
  venue_name: string | null;
  venue_location: string | null;
  budget_tier: BudgetTier | null;
  message: string | null;
  status: RequestStatus;
  created_at: string;
}

export type MealRequestInsert = Insert<MealRequestRow, 'activity_type' | 'proposed_time'>;
export type MealRequestUpdate = Partial<MealRequestRow>;

// ---------------------------------------------------------------------------
// bookings
// ---------------------------------------------------------------------------
// venue_name + venue_location are NOT NULL: a booking only exists once
// the request was accepted and a public venue chosen (core product rule #2).
// companion_fee is a decimal snapshot of the companion's rate at booking
// time (core product rule #4).

export interface BookingRow {
  id: string;
  request_id: string | null;
  activity_type: ActivityType;
  venue_name: string;
  venue_location: string;
  scheduled_time: string;
  budget_tier: BudgetTier;
  companion_fee: string;
  status: BookingStatus;
  created_at: string;
}

export type BookingInsert = Insert<
  BookingRow,
  | 'activity_type'
  | 'venue_name'
  | 'venue_location'
  | 'scheduled_time'
  | 'budget_tier'
  | 'companion_fee'
>;
export type BookingUpdate = Partial<BookingRow>;

// ---------------------------------------------------------------------------
// payments
// ---------------------------------------------------------------------------
// Card data NEVER lands here (core product rule #11) — only Stripe ids.

export interface PaymentRow {
  id: string;
  booking_id: string | null;
  fee_amount: string;
  platform_cut: string;
  escrow_status: EscrowStatus;
  stripe_payment_intent_id: string | null;
  stripe_transfer_id: string | null;
  created_at: string;
}

export type PaymentInsert = Insert<PaymentRow, 'fee_amount' | 'platform_cut'>;
export type PaymentUpdate = Partial<PaymentRow>;

// ---------------------------------------------------------------------------
// messages
// ---------------------------------------------------------------------------
// sender_id is nullable so the platform can author system entries
// (e.g. "Booking confirmed"). RLS guarantees only booking participants
// may INSERT a non-system message.

export interface MessageRow {
  id: string;
  booking_id: string | null;
  sender_id: string | null;
  body: string;
  is_system_message: boolean;
  sent_at: string;
}

export type MessageInsert = Insert<MessageRow, 'body'>;
/** messages are immutable; no UPDATE policy. */
export type MessageUpdate = never;

// ---------------------------------------------------------------------------
// reviews
// ---------------------------------------------------------------------------

export interface ReviewRow {
  id: string;
  booking_id: string | null;
  reviewer_id: string | null;
  reviewee_id: string | null;
  rating: number | null;
  comment: string | null;
  created_at: string;
}

export type ReviewInsert = Insert<ReviewRow, 'rating'>;
/** reviews are immutable; no UPDATE policy. */
export type ReviewUpdate = never;

// ---------------------------------------------------------------------------
// invite_codes / invite_redemptions  (beta gate; see 20260520000100)
// ---------------------------------------------------------------------------

export interface InviteCodeRow {
  id: string;
  code: string;
  note: string | null;
  max_uses: number | null;
  used_count: number;
  expires_at: string | null;
  created_by: string | null;
  created_at: string;
}
export type InviteCodeInsert = Insert<InviteCodeRow, 'code'>;
export type InviteCodeUpdate = Partial<InviteCodeRow>;

export interface InviteRedemptionRow {
  id: string;
  invite_code_id: string;
  user_id: string;
  redeemed_at: string;
}
export type InviteRedemptionInsert = Insert<InviteRedemptionRow, 'invite_code_id' | 'user_id'>;
/** redemptions are immutable. */
export type InviteRedemptionUpdate = never;

// ---------------------------------------------------------------------------
// feedback_reports  (in-app "Report an issue"; see 20260520000100)
// ---------------------------------------------------------------------------

export interface FeedbackReportRow {
  id: string;
  user_id: string;
  category: 'bug' | 'idea' | 'complaint' | 'other';
  body: string;
  url: string | null;
  created_at: string;
}
export type FeedbackReportInsert = Insert<FeedbackReportRow, 'category' | 'body'>;
/** reports are immutable from the client. */
export type FeedbackReportUpdate = never;

// ---------------------------------------------------------------------------
// Aggregated `Database` shape — type parameter for createClient<Database>()
// ---------------------------------------------------------------------------

export interface Database {
  public: {
    Tables: {
      users: {
        Row: UserRow;
        Insert: UserInsert;
        Update: UserUpdate;
        Relationships: [];
      };
      companion_profiles: {
        Row: CompanionProfileRow;
        Insert: CompanionProfileInsert;
        Update: CompanionProfileUpdate;
        Relationships: [];
      };
      availability: {
        Row: AvailabilityRow;
        Insert: AvailabilityInsert;
        Update: AvailabilityUpdate;
        Relationships: [];
      };
      meal_requests: {
        Row: MealRequestRow;
        Insert: MealRequestInsert;
        Update: MealRequestUpdate;
        Relationships: [];
      };
      bookings: {
        Row: BookingRow;
        Insert: BookingInsert;
        Update: BookingUpdate;
        Relationships: [];
      };
      payments: {
        Row: PaymentRow;
        Insert: PaymentInsert;
        Update: PaymentUpdate;
        Relationships: [];
      };
      messages: {
        Row: MessageRow;
        Insert: MessageInsert;
        Update: MessageUpdate;
        Relationships: [];
      };
      reviews: {
        Row: ReviewRow;
        Insert: ReviewInsert;
        Update: ReviewUpdate;
        Relationships: [];
      };
      invite_codes: {
        Row: InviteCodeRow;
        Insert: InviteCodeInsert;
        Update: InviteCodeUpdate;
        Relationships: [];
      };
      invite_redemptions: {
        Row: InviteRedemptionRow;
        Insert: InviteRedemptionInsert;
        Update: InviteRedemptionUpdate;
        Relationships: [];
      };
      feedback_reports: {
        Row: FeedbackReportRow;
        Insert: FeedbackReportInsert;
        Update: FeedbackReportUpdate;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      /** Defined in 20260515000600_rls.sql; returns true if auth.uid() is the seeker or companion on the booking. */
      is_booking_participant: {
        Args: { p_booking_id: string };
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
