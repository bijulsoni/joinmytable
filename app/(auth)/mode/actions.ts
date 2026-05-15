'use server';

// Server action that toggles which mode(s) the signed-in user operates
// in. Backs the mode-switcher on the settings card and the "enable
// companion mode" CTA on the verification screen.
//
// Enforces the one-account-two-modes invariant: at least one of the two
// flags must remain true.

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { updateUserModes } from '@/lib/auth/profile';

const Schema = z.object({
  isSeeker: z.boolean(),
  isCompanion: z.boolean(),
});

export type ModeState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'ok' };

export async function setModesAction(
  _prev: ModeState,
  formData: FormData,
): Promise<ModeState> {
  const parsed = Schema.safeParse({
    isSeeker: formData.get('isSeeker') === 'on',
    isCompanion: formData.get('isCompanion') === 'on',
  });
  if (!parsed.success) {
    return { status: 'error', message: 'Invalid mode selection.' };
  }

  const result = await updateUserModes(parsed.data);
  if (!result.ok) {
    return { status: 'error', message: result.error };
  }

  // The mode-switcher renders in the auth shell and may render in the
  // verification flow - refresh both server-rendered surfaces.
  revalidatePath('/verify');
  revalidatePath('/');

  return { status: 'ok' };
}
