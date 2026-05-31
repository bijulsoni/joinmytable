// /api/profiles/[id] - public read of a companion profile by user_id.
//
//   GET - returns the verified companion's public view + availability.
//
// Verification gating (core product rule #10) is enforced by the
// `companion_profiles_select_verified` RLS policy: an unverified profile
// is invisible to the caller, so an `.eq('user_id', id)` lookup returns
// no rows and we respond 404 - we never leak existence.
//
// The caller must be authenticated; anonymous discovery is out of scope
// for this MVP (matches the rest of the app, which expects a signed-in user).

import { NextResponse } from 'next/server';
import { apiError, requireAuth, uuidSchema } from '@/app/api/_lib';
import { loadPublicCompanionProfile } from '../_lib/load';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, ctx: RouteContext): Promise<NextResponse> {
  const { id: rawId } = await ctx.params;
  const idCheck = uuidSchema.safeParse(rawId);
  if (!idCheck.success) {
    return apiError('not_found', 'Companion profile not found.');
  }

  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  // Shared in-process loader (also used directly by the /companions/[id]
  // page, which no longer round-trips back through this route over HTTP).
  try {
    const dto = await loadPublicCompanionProfile(auth.caller.supabase, idCheck.data);
    if (!dto) {
      return apiError('not_found', 'Companion profile not found.');
    }
    return NextResponse.json({ profile: dto });
  } catch {
    return apiError('internal_error', 'Could not load companion profile.');
  }
}
