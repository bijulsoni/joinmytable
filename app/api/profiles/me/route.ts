// /api/profiles/me - the signed-in user's companion profile.
//
//   GET    - fetch the authenticated user's companion profile + base user fields
//   PUT    - upsert the companion profile (create on first call, update later)
//   DELETE - hard-delete the companion profile (cascades availability)
//
// Contract: see /app/api/profiles/CONTRACT.md.
//
// Authorization: PUT/DELETE require companion mode. Verification status
// is NOT writable here - Trust & Safety owns
// `companion_profiles.verified_at` and `users.verification_status`.
// Discovery gating for unverified companions is enforced by RLS.

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { apiError, parseJsonBody, requireAuth } from '@/app/api/_lib';
import { toOwnCompanionProfileDTO, type OwnCompanionProfileDTO } from '../_lib/types';
import { companionProfileUpsertSchema } from '../_lib/validators';
import type { CompanionProfileRow, CompanionProfileUpdate, UserRow } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { caller } = auth;

  const { data, error } = await caller.supabase
    .from('companion_profiles')
    .select('*')
    .eq('user_id', caller.userId)
    .maybeSingle();

  if (error) {
    return apiError('internal_error', 'Could not load companion profile.');
  }
  if (!data) {
    return apiError('not_found', 'No companion profile yet.');
  }

  const dto: OwnCompanionProfileDTO = toOwnCompanionProfileDTO(
    data as CompanionProfileRow,
    caller.profile,
  );
  return NextResponse.json({ profile: dto });
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { caller } = auth;

  const parsed = await parseJsonBody(request, companionProfileUpsertSchema);
  if (!parsed.ok) return parsed.response;
  const input = parsed.data;

  // Read existing row to decide insert vs update. We avoid `.upsert()`
  // because it would let a caller silently overwrite owner-only columns
  // (verified_at, rating_avg) by sending them with the payload.
  const { data: existing, error: readErr } = await caller.supabase
    .from('companion_profiles')
    .select('user_id')
    .eq('user_id', caller.userId)
    .maybeSingle();

  if (readErr) {
    return apiError('internal_error', 'Could not load companion profile.');
  }

  const writable: CompanionProfileUpdate = {};
  if (input.bio !== undefined) writable.bio = input.bio;
  if (input.service_area !== undefined) writable.service_area = input.service_area;
  if (input.activities !== undefined) writable.activities = input.activities;
  if (input.rates !== undefined) writable.rates = input.rates;
  if (input.payout_method !== undefined) {
    (writable as Record<string, unknown>).payout_method = input.payout_method;
  }
  if (input.payout_handle !== undefined) {
    (writable as Record<string, unknown>).payout_handle = input.payout_handle;
  }
  // PostGIS geography(Point, 4326) doesn't accept raw GeoJSON via PostgREST —
  // it expects EWKT (`SRID=4326;POINT(lng lat)`). The validator accepts the
  // friendlier GeoJSON shape on the wire and we convert here. Cast through
  // unknown because the typed column shape is GeoJSONPoint, but the wire
  // value into the DB is a string.
  if (input.location !== undefined) {
    if (input.location === null) {
      (writable as Record<string, unknown>).location = null;
    } else {
      const [lng, lat] = input.location.coordinates;
      (writable as Record<string, unknown>).location = `SRID=4326;POINT(${lng} ${lat})`;
    }
  }

  const renderUser: UserRow = caller.profile;

  if (!existing) {
    const insertPayload = { user_id: caller.userId, ...writable };
    const { data: inserted, error: insertErr } = await caller.supabase
      .from('companion_profiles')
      .insert(insertPayload)
      .select('*')
      .single();
    if (insertErr || !inserted) {
      return apiError(
        'internal_error',
        insertErr?.message ?? 'Could not create companion profile.',
      );
    }
    return NextResponse.json(
      { profile: toOwnCompanionProfileDTO(inserted as CompanionProfileRow, renderUser) },
      { status: 201 },
    );
  }

  const { data: updated, error: updErr } = await caller.supabase
    .from('companion_profiles')
    .update(writable)
    .eq('user_id', caller.userId)
    .select('*')
    .single();
  if (updErr || !updated) {
    return apiError('internal_error', updErr?.message ?? 'Could not update companion profile.');
  }
  return NextResponse.json({
    profile: toOwnCompanionProfileDTO(updated as CompanionProfileRow, renderUser),
  });
}

export async function DELETE(): Promise<NextResponse> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { caller } = auth;

  // ON DELETE CASCADE on `availability.companion_profile_id` removes the
  // windows. Bookings reference users.id (via the meal_requests chain),
  // not the companion profile, so historical bookings survive.
  const { error } = await caller.supabase
    .from('companion_profiles')
    .delete()
    .eq('user_id', caller.userId);
  if (error) {
    return apiError('internal_error', error.message || 'Could not delete companion profile.');
  }
  return new NextResponse(null, { status: 204 });
}
