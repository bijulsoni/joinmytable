'use server';

// Server action that accepts a profile photo, validates it server-side,
// uploads it to Supabase Storage, and updates `users.avatar_path`.
//
// Client-side validation is best-effort - the server is the source of
// truth (CORE PRODUCT RULE: server-side authority).

import { revalidatePath } from 'next/cache';
import { uploadAvatar } from '@/lib/auth/storage';

export type AvatarState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'ok'; path: string };

export async function uploadAvatarAction(
  _prev: AvatarState,
  formData: FormData,
): Promise<AvatarState> {
  const file = formData.get('avatar');
  if (!(file instanceof Blob) || file.size === 0) {
    return { status: 'error', message: 'Choose a photo to upload.' };
  }

  const result = await uploadAvatar(file);
  if (!result.ok) {
    return { status: 'error', message: result.error };
  }

  revalidatePath('/verify');
  revalidatePath('/');
  return { status: 'ok', path: result.path };
}
