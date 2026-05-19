import 'server-only';

// POST /api/requests — seeker creates a meal request to a companion.
// GET  /api/requests — list requests visible to the caller (as seeker
//                      or companion).
//
// Business rules enforced server-side:
//   - Caller must be in seeker mode (POST) or just authenticated (GET).
//   - companion_id must reference a verified companion in companion mode.
//   - companion_id != seeker (self-request rejected).
//   - activity_type must be one the companion offers (per their
//     companion_profiles.activities map).
//   - Request is created with status='requested'.
//
// Notifications: on successful POST, fires the email pipeline
// (request_received) for the companion — never-throws.

import { NextResponse, type NextRequest } from 'next/server';
import { apiError, parseJsonBody, requireAuth } from '@/app/api/_lib';
import { ACTIVITY_TYPES, type ActivityType } from '@/lib/types';
import { notify } from '@/lib/notifications';
import { createSupabaseAdminClient } from '@/lib/supabase/server';
import { createRequestSchema } from './_lib/validators';
import type { MealRequestDTO, MealRequestRow } from './_lib/types';

function toDto(
  row: MealRequestRow,
  counterpartName: string | null = null,
  bookingId: string | null = null,
): MealRequestDTO {
  return {
    id: row.id,
    seeker_id: row.seeker_id,
    companion_id: row.companion_id,
    activity_type: row.activity_type,
    proposed_time: row.proposed_time,
    venue_name: row.venue_name,
    venue_location: row.venue_location,
    budget_tier: row.budget_tier,
    message: row.message,
    status: row.status,
    created_at: row.created_at,
    counterpart_name: counterpartName,
    booking_id: bookingId,
  };
}

export async function POST(request: NextRequest) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;
  const { caller } = guard;

  const body = await parseJsonBody(request, createRequestSchema);
  if (!body.ok) return body.response;
  const {
    companion_id,
    activity_type,
    proposed_time,
    venue_name,
    venue_location,
    budget_tier,
    message,
  } = body.data;

  // Self-request guard.
  if (companion_id === caller.userId) {
    return apiError('invalid_input', 'You cannot send a request to yourself.');
  }

  // Look up the companion profile to validate they're verified and offer
  // the requested activity. Admin client to bypass RLS — we explicitly
  // need to read non-verified profiles to surface a clean error.
  const admin = createSupabaseAdminClient();
  const { data: companionRaw, error: companionErr } = await admin
    .from('companion_profiles')
    .select('user_id, activities, verified_at, users!inner(is_companion, name)')
    .eq('user_id', companion_id)
    .maybeSingle();

  if (companionErr) {
    return apiError('internal_error', `Could not load companion: ${companionErr.message}`);
  }
  if (!companionRaw) {
    return apiError('not_found', 'Companion profile not found.');
  }

  const companion = companionRaw as unknown as {
    user_id: string;
    activities: Record<string, boolean> | null;
    verified_at: string | null;
    users: { is_companion: boolean; name: string | null };
  };

  if (!companion.users.is_companion) {
    return apiError('conflict', 'That user is not currently accepting companion requests.');
  }
  if (!companion.verified_at) {
    return apiError('forbidden', 'Only verified companions can receive requests.');
  }

  const offered = companion.activities?.[activity_type] === true;
  if (!offered) {
    return apiError('invalid_input', `This companion does not offer ${activity_type}.`);
  }

  // Insert via the request-scoped (RLS-enforced) client; the RLS policy
  // `meal_requests_insert_seeker` requires seeker_id = auth.uid().
  const { data: inserted, error: insertErr } = await caller.supabase
    .from('meal_requests')
    .insert({
      seeker_id: caller.userId,
      companion_id,
      activity_type,
      proposed_time,
      venue_name: venue_name ?? null,
      venue_location: venue_location ?? null,
      budget_tier: budget_tier ?? null,
      message: message ?? null,
      status: 'requested',
    })
    .select('*')
    .single();

  if (insertErr || !inserted) {
    return apiError(
      'internal_error',
      `Could not create request: ${insertErr?.message ?? 'no row returned'}`,
    );
  }

  const row = inserted as MealRequestRow;

  // Fire-and-forget notification. Never-throws by design.
  void notify('request_received', {
    recipient_user_id: companion_id,
    data: {
      companionName: companion.users.name ?? 'there',
      seekerName: caller.profile.name,
      activityType: activity_type,
      proposedTime: proposed_time,
      message: message ?? null,
      requestId: row.id,
    },
  });

  return NextResponse.json({ request: toDto(row, companion.users.name) }, { status: 201 });
}

export async function GET(_request: NextRequest) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;
  const { caller } = guard;

  // RLS gates SELECT to rows where seeker_id = auth.uid() OR companion_id =
  // auth.uid(). We left-join users twice to fetch the counterpart's name
  // for the UI list. Also left-join bookings so an accepted request can
  // surface its booking_id (so the seeker can deep-link to /bookings/[id]).
  const { data, error } = await caller.supabase
    .from('meal_requests')
    .select(
      `*,
       seeker:users!meal_requests_seeker_id_fkey(name),
       companion:users!meal_requests_companion_id_fkey(name),
       bookings!bookings_request_id_fkey(id)`,
    )
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    return apiError('internal_error', `Could not load requests: ${error.message}`);
  }

  const rows = (data ?? []) as Array<
    MealRequestRow & {
      seeker: { name: string | null } | null;
      companion: { name: string | null } | null;
      bookings: Array<{ id: string }> | { id: string } | null;
    }
  >;

  const requests = rows.map((row) => {
    const counterpartName =
      row.seeker_id === caller.userId ? (row.companion?.name ?? null) : (row.seeker?.name ?? null);
    const bookingId = Array.isArray(row.bookings)
      ? (row.bookings[0]?.id ?? null)
      : (row.bookings?.id ?? null);
    return toDto(row, counterpartName, bookingId);
  });

  const inbound = requests.filter((r) => r.companion_id === caller.userId);
  const outbound = requests.filter((r) => r.seeker_id === caller.userId);

  return NextResponse.json({ inbound, outbound, requests });
}

// Re-exported for the [id] PATCH handler — keeps the activity-types
// allow-list aligned with the validator at module boundary.
export { ACTIVITY_TYPES };
export type { ActivityType };
