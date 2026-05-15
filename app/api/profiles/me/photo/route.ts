// /api/profiles/me/photo - manage the photo reference.
//
//   PUT    - point the user row at an existing storage path
//   DELETE - clear the avatar reference
//
// This endpoint does NOT upload bytes - Auth & Identity owns the upload
// pipeline (see lib/auth/storage.ts#uploadAvatar). Use this when the
// Frontend already has a path (e.g. user re-selected one of their
// previously uploaded photos, or wants to remove their avatar without
// uploading a new one).
//
// We require the supplied path to live under the caller's userId prefix
// to prevent a caller from pointing their avatar at someone else's
// object - the Auth agent's uploader uses `<userId>/...` as the convention.

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { requireAuth } from '../../_lib/auth';
import { apiError } from '../../_lib/errors';
import { parseJsonBody } from '../../_lib/parse';
import { photoSetSchema } from '../../_lib/validators';
import type { UserRow } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface PhotoResponseBody {
  avatar_path: string | null;
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { caller } = auth;

  const parsed = await parseJsonBody(request, photoSetSchema);
  if (!parsed.ok) return parsed.response;
  const { avatar_path } = parsed.data;

  const expectedPrefix = `${caller.userId}/`;
  if (!avatar_path.startsWith(expectedPrefix)) {
    return apiError('forbidden', 'avatar_path must point at one of your own uploads.');
  }

  const { data, error } = await caller.supabase
    .from('users')
    .update({ avatar_path })
    .eq('id', caller.userId)
    .select('avatar_path')
    .single();
  if (error || !data) {
    return apiError('internal_error', error?.message ?? 'Could not update avatar.');
  }
  const body: PhotoResponseBody = {
    avatar_path: (data as Pick<UserRow, 'avatar_path'>).avatar_path,
  };
  return NextResponse.json(body);
}

export async function DELETE(): Promise<NextResponse> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { caller } = auth;

  const { error } = await caller.supabase
    .from('users')
    .update({ avatar_path: null })
    .eq('id', caller.userId);
  if (error) {
    return apiError('internal_error', error.message || 'Could not clear avatar.');
  }
  const body: PhotoResponseBody = { avatar_path: null };
  return NextResponse.json(body);
}
