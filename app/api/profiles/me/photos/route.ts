// /api/profiles/me/photos - manage the companion profile photo array.
//
//   POST   - append a URL to companion_profiles.photo_urls
//   DELETE - remove a URL from companion_profiles.photo_urls
//
// The new schema stores `photo_urls text[]` directly on the companion
// profile (not `users.avatar_path` like the earlier draft). Bytes are
// uploaded through Supabase Storage (Auth & Identity agent owns the
// uploader); this endpoint just maintains the URL list.

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { apiError, parseJsonBody, requireAuth } from '@/app/api/_lib';
import { photoAddSchema, photoRemoveSchema } from '../../_lib/validators';
import type { CompanionProfileRow } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface PhotosResponseBody {
  photo_urls: string[];
}

const MAX_PHOTOS = 8;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { caller } = auth;

  const parsed = await parseJsonBody(request, photoAddSchema);
  if (!parsed.ok) return parsed.response;
  const { url } = parsed.data;

  const { data: profileRaw, error: readErr } = await caller.supabase
    .from('companion_profiles')
    .select('id, photo_urls')
    .eq('user_id', caller.userId)
    .maybeSingle();
  if (readErr) {
    return apiError('internal_error', 'Could not load companion profile.');
  }
  if (!profileRaw) {
    return apiError('conflict', 'Set up your companion profile before adding photos.');
  }
  const profile = profileRaw as Pick<CompanionProfileRow, 'id' | 'photo_urls'>;
  const current = profile.photo_urls ?? [];
  if (current.includes(url)) {
    // Idempotent: already in the list, no-op.
    const body: PhotosResponseBody = { photo_urls: current };
    return NextResponse.json(body);
  }
  if (current.length >= MAX_PHOTOS) {
    return apiError(
      'conflict',
      `You can store at most ${MAX_PHOTOS} photos. Remove one before adding another.`,
    );
  }

  const next = [...current, url];
  const { data, error } = await caller.supabase
    .from('companion_profiles')
    .update({ photo_urls: next })
    .eq('id', profile.id)
    .select('photo_urls')
    .single();
  if (error || !data) {
    return apiError('internal_error', error?.message ?? 'Could not add photo.');
  }
  const body: PhotosResponseBody = {
    photo_urls: (data as Pick<CompanionProfileRow, 'photo_urls'>).photo_urls ?? [],
  };
  return NextResponse.json(body, { status: 201 });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { caller } = auth;

  const parsed = await parseJsonBody(request, photoRemoveSchema);
  if (!parsed.ok) return parsed.response;
  const { url } = parsed.data;

  const { data: profileRaw, error: readErr } = await caller.supabase
    .from('companion_profiles')
    .select('id, photo_urls')
    .eq('user_id', caller.userId)
    .maybeSingle();
  if (readErr) {
    return apiError('internal_error', 'Could not load companion profile.');
  }
  if (!profileRaw) {
    return apiError('not_found', 'Companion profile not found.');
  }
  const profile = profileRaw as Pick<CompanionProfileRow, 'id' | 'photo_urls'>;
  const current = profile.photo_urls ?? [];
  if (!current.includes(url)) {
    // Idempotent: not present, nothing to remove.
    const body: PhotosResponseBody = { photo_urls: current };
    return NextResponse.json(body);
  }

  const next = current.filter((u) => u !== url);
  const { data, error } = await caller.supabase
    .from('companion_profiles')
    .update({ photo_urls: next })
    .eq('id', profile.id)
    .select('photo_urls')
    .single();
  if (error || !data) {
    return apiError('internal_error', error?.message ?? 'Could not remove photo.');
  }
  const body: PhotosResponseBody = {
    photo_urls: (data as Pick<CompanionProfileRow, 'photo_urls'>).photo_urls ?? [],
  };
  return NextResponse.json(body);
}
