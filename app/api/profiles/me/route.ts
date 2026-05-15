// /api/profiles/me - the signed-in user's companion profile.
//
//   GET    - fetch the authenticated user's companion profile + base user fields
//   PUT    - upsert the companion profile (create on first call, update later)
//   DELETE - hard-delete the companion profile (cascades availability)
//
// Contract: see /app/api/profiles/CONTRACT.md.
//
// Authorization: all three methods require companion mode. Verification
// status is NOT writable here - the Auth & Identity agent's verification
// flow owns it (companion_profiles.verification_status). Verification
// gating for discoverability is enforced by RLS on read paths.

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { requireAuth, requireCompanionMode } from '../_lib/auth';
import { apiError } from '../_lib/errors';
import { parseJsonBody } from '../_lib/parse';
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

  const dto: OwnCompanionProfileDTO = toOwnCompanionProfileDTO(data as CompanionProfileRow, {
    display_name: caller.profile.display_name,
    email: caller.email || caller.profile.email,
    avatar_path: caller.profile.avatar_path,
  });
  return NextResponse.json({ profile: dto });
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const auth = await requireCompanionMode();
  if (!auth.ok) return auth.response;
  const { caller } = auth;

  const parsed = await parseJsonBody(request, companionProfileUpsertSchema);
  if (!parsed.ok) return parsed.response;
  const input = parsed.data;

  // Read existing row to decide insert vs update. We avoid `.upsert()`
  // because it would let a caller silently overwrite owner-only columns
  // (verification_status, stripe_connect_account_id, rating roll-up).
  const { data: existingRaw, error: readErr } = await caller.supabase
    .from('companion_profiles')
    .select('user_id')
    .eq('user_id', caller.userId)
    .maybeSingle();

  if (readErr) {
    return apiError('internal_error', 'Could not load companion profile.');
  }

  const writable: CompanionProfileUpdate = {
    headline: input.headline,
    bio_long: input.bio_long,
    rate_cents: input.rate_cents,
    rate_currency: input.rate_currency,
    meal_types: input.meal_types,
    // PostGIS geography(Point, 4326) accepts a GeoJSON Point payload via
    // PostgREST; the column is declared as such in the frozen Database type.
    service_area_center: input.service_area_center,
    service_radius_m: input.service_radius_m,
  };

  if (!existingRaw) {
    const insertPayload: CompanionProfileUpdate & { user_id: string } = {
      user_id: caller.userId,
      ...writable,
    };
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
      {
        profile: toOwnCompanionProfileDTO(inserted as CompanionProfileRow, {
          display_name: caller.profile.display_name,
          email: caller.email || caller.profile.email,
          avatar_path: caller.profile.avatar_path,
        }),
      },
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
    profile: toOwnCompanionProfileDTO(updated as CompanionProfileRow, {
      display_name: (caller.profile as UserRow).display_name,
      email: caller.email || (caller.profile as UserRow).email,
      avatar_path: (caller.profile as UserRow).avatar_path,
    }),
  });
}

export async function DELETE(): Promise<NextResponse> {
  const auth = await requireCompanionMode();
  if (!auth.ok) return auth.response;
  const { caller } = auth;

  // Hard delete. ON DELETE CASCADE on `availability.companion_user_id`
  // takes the windows with it. Bookings reference users.id, not the
  // companion profile, so historical bookings are preserved.
  const { error } = await caller.supabase
    .from('companion_profiles')
    .delete()
    .eq('user_id', caller.userId);
  if (error) {
    return apiError('internal_error', error.message || 'Could not delete companion profile.');
  }
  return new NextResponse(null, { status: 204 });
}
