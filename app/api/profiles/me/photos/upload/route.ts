// POST /api/profiles/me/photos/upload — receive an image via multipart
// form-data, push it to Storage, then append the resulting public URL
// to the caller's companion_profiles.photo_urls.
//
// The sister endpoint /api/profiles/me/photos accepts pre-uploaded URLs
// (kept for the case where the client uploads via a signed URL flow).
// This route is the one-shot path the profile UI uses: pick a file →
// POST → photo lives in the gallery.

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { apiError, requireAuth } from '@/app/api/_lib';
import { uploadCompanionPhoto, avatarBucketPublicUrl } from '@/lib/auth/storage';
import type { CompanionProfileRow } from '@/lib/types';

export const dynamic = 'force-dynamic';

const MAX_PHOTOS = 8;

interface UploadResponseBody {
  photo_urls: string[];
  added_url: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { caller } = auth;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return apiError('invalid_input', 'Expected multipart/form-data with a "file" field.');
  }
  const fileField = form.get('file');
  if (!(fileField instanceof Blob) || fileField.size === 0) {
    return apiError('invalid_input', 'No file provided. Attach an image under the "file" field.');
  }

  const { data: profileRaw, error: readErr } = await caller.supabase
    .from('companion_profiles')
    .select('id, photo_urls')
    .eq('user_id', caller.userId)
    .maybeSingle();
  if (readErr) {
    return apiError('internal_error', 'Could not load companion profile.');
  }

  // Lazy-create the companion_profiles row on first photo upload. The
  // /welcome onboarding flow lets users add photos before they've hit
  // Continue (which is the moment the rest of the profile is written),
  // so the row may not exist yet. RLS allows the caller to insert
  // their own row.
  let profile: Pick<CompanionProfileRow, 'id' | 'photo_urls'>;
  if (profileRaw) {
    profile = profileRaw as Pick<CompanionProfileRow, 'id' | 'photo_urls'>;
  } else {
    const { data: inserted, error: insertErr } = await caller.supabase
      .from('companion_profiles')
      .insert({ user_id: caller.userId })
      .select('id, photo_urls')
      .single();
    if (insertErr || !inserted) {
      return apiError(
        'internal_error',
        insertErr?.message ?? 'Could not create companion profile.',
      );
    }
    profile = inserted as Pick<CompanionProfileRow, 'id' | 'photo_urls'>;
  }
  const current = profile.photo_urls ?? [];
  if (current.length >= MAX_PHOTOS) {
    return apiError(
      'conflict',
      `You can store at most ${MAX_PHOTOS} photos. Remove one before adding another.`,
    );
  }

  const upload = await uploadCompanionPhoto(fileField);
  if (!upload.ok) {
    return apiError('invalid_input', upload.error);
  }

  const publicUrl = avatarBucketPublicUrl(upload.path);
  const next = [...current, publicUrl];

  const { data, error } = await caller.supabase
    .from('companion_profiles')
    .update({ photo_urls: next })
    .eq('id', profile.id)
    .select('photo_urls')
    .single();
  if (error || !data) {
    return apiError('internal_error', error?.message ?? 'Could not save photo URL.');
  }

  const body: UploadResponseBody = {
    photo_urls: (data as Pick<CompanionProfileRow, 'photo_urls'>).photo_urls ?? [],
    added_url: publicUrl,
  };
  return NextResponse.json(body, { status: 201 });
}
