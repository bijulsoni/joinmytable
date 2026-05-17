import 'server-only';

// Supabase Storage helpers for identity-related uploads.
//
// Buckets used:
//   - `avatars`        : public profile photo (referenced by users.avatar_path)
//   - `verification`   : private companion verification documents
//
// Both buckets must exist in the Supabase project. The Auth & Identity
// agent ensures their existence on first use via the admin client; the
// helpers below are idempotent so re-running across cold starts is safe.
//
// Validation invariants (server-side; do not trust the client):
//   - MIME type is in an allow-list of images
//   - byte length is within the per-bucket maximum
//
// The signed-in user can only write under their own user-id-prefixed
// path; the admin client is used purely to provision the bucket and to
// upload (so we can enforce path constraints without relying on Storage
// RLS, which is configured by the Database agent).

import { createSupabaseAdminClient } from '@/lib/supabase/server';
import { authServerClient } from './db';

export const AVATAR_BUCKET = 'avatars';
export const VERIFICATION_BUCKET = 'verification';

const ALLOWED_IMAGE_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

const AVATAR_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const VERIFICATION_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export interface StorageUploadResult {
  ok: true;
  path: string;
}

export interface StorageUploadError {
  ok: false;
  error: string;
}

interface UploadInput {
  bucket: string;
  /** Object key inside the bucket, NOT including the bucket name. */
  objectKey: string;
  file: Blob;
  upsert?: boolean;
  /** When true the bucket is created public on first use. */
  publicBucket: boolean;
  maxBytes: number;
}

async function ensureBucket(bucket: string, publicBucket: boolean): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage.getBucket(bucket);
  if (data) return;
  if (error && !/not found/i.test(error.message)) {
    // Surface unexpected failures; bucket-missing is the only path we
    // want to silently provision.
    throw new Error(`Storage bucket lookup failed: ${error.message}`);
  }
  const { error: createErr } = await admin.storage.createBucket(bucket, {
    public: publicBucket,
  });
  if (createErr && !/already exists/i.test(createErr.message)) {
    throw new Error(`Could not create storage bucket: ${createErr.message}`);
  }
}

function validateImage(file: Blob, maxBytes: number): string | null {
  if (file.size === 0) return 'File is empty.';
  if (file.size > maxBytes) {
    return `File is too large (max ${Math.round(maxBytes / (1024 * 1024))} MB).`;
  }
  if (!ALLOWED_IMAGE_MIME.has(file.type)) {
    return 'Unsupported image type. Use JPG, PNG, WEBP, or HEIC.';
  }
  return null;
}

async function uploadBlob(input: UploadInput): Promise<StorageUploadResult | StorageUploadError> {
  const validationError = validateImage(input.file, input.maxBytes);
  if (validationError) return { ok: false, error: validationError };

  await ensureBucket(input.bucket, input.publicBucket);

  const admin = createSupabaseAdminClient();
  const { error } = await admin.storage.from(input.bucket).upload(input.objectKey, input.file, {
    upsert: input.upsert ?? true,
    contentType: input.file.type,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, path: input.objectKey };
}

/**
 * Upload the signed-in user's avatar to Storage. Returns the object key
 * on success. The new schema has no avatar column on `users`; companion
 * profile photos live in `companion_profiles.photo_urls` and are written
 * by the Core API on profile update.
 */
export async function uploadAvatar(file: Blob): Promise<StorageUploadResult | StorageUploadError> {
  const supabase = await authServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: 'Not signed in.' };

  const ext = mimeToExt(file.type);
  const objectKey = `${auth.user.id}/avatar-${Date.now()}.${ext}`;

  return uploadBlob({
    bucket: AVATAR_BUCKET,
    objectKey,
    file,
    publicBucket: true,
    upsert: true,
    maxBytes: AVATAR_MAX_BYTES,
  });
}

/**
 * Upload a companion identity-verification document. Stored in a
 * private bucket; the only consumer is the (future) admin review tool.
 */
export async function uploadVerificationDocument(
  file: Blob,
): Promise<StorageUploadResult | StorageUploadError> {
  const supabase = await authServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: 'Not signed in.' };

  const ext = mimeToExt(file.type);
  const objectKey = `${auth.user.id}/id-${Date.now()}.${ext}`;

  return uploadBlob({
    bucket: VERIFICATION_BUCKET,
    objectKey,
    file,
    publicBucket: false,
    upsert: false,
    maxBytes: VERIFICATION_MAX_BYTES,
  });
}

/** Resolve a public avatar URL for rendering. Returns null when unset. */
export async function avatarPublicUrl(avatarPath: string | null): Promise<string | null> {
  if (!avatarPath) return null;
  const admin = createSupabaseAdminClient();
  const { data } = admin.storage.from(AVATAR_BUCKET).getPublicUrl(avatarPath);
  return data.publicUrl ?? null;
}

function mimeToExt(mime: string): string {
  switch (mime) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/heic':
      return 'heic';
    case 'image/heif':
      return 'heif';
    default:
      return 'bin';
  }
}
