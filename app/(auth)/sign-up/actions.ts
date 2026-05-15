'use server';

// Server action backing the sign-up form. Steps:
//   1. Validate the payload (zod).
//   2. Call Supabase Auth signUp (email + password).
//   3. Insert the public.users mirror row with the chosen modes and
//      community guidelines acceptance.
//   4. If a session was returned (email confirmation disabled), redirect
//      to the verification screen so the seeker/companion can finish
//      setup; otherwise route to a "check your inbox" notice.

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createUserMirrorRow } from '@/lib/auth/profile';
import { reconcileSeekerVerification } from '@/lib/auth/verification';
import { logger } from '@/lib/logger';

const log = logger.child({ module: 'auth.sign-up' });

const SignUpSchema = z
  .object({
    email: z.string().email('Enter a valid email address.'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters.')
      .max(72, 'Password is too long.'),
    displayName: z
      .string()
      .min(1, 'Display name is required.')
      .max(80, 'Display name is too long.'),
    isSeeker: z.boolean(),
    isCompanion: z.boolean(),
    acceptGuidelines: z
      .boolean()
      .refine((v) => v === true, 'You must accept the community guidelines.'),
  })
  .refine((v) => v.isSeeker || v.isCompanion, {
    path: ['isSeeker'],
    message: 'Pick at least one mode.',
  });

export type SignUpState = { status: 'idle' } | { status: 'error'; message: string };

export async function signUpAction(_prev: SignUpState, formData: FormData): Promise<SignUpState> {
  const parsed = SignUpSchema.safeParse({
    email: String(formData.get('email') ?? '')
      .trim()
      .toLowerCase(),
    password: String(formData.get('password') ?? ''),
    displayName: String(formData.get('displayName') ?? '').trim(),
    isSeeker: formData.get('isSeeker') === 'on',
    isCompanion: formData.get('isCompanion') === 'on',
    acceptGuidelines: formData.get('acceptGuidelines') === 'on',
  });

  if (!parsed.success) {
    return {
      status: 'error',
      message: parsed.error.issues[0]?.message ?? 'Invalid sign-up details.',
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data: authResult, error: authError } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { display_name: parsed.data.displayName },
    },
  });

  if (authError || !authResult.user) {
    log.warn({ err: authError?.message }, 'sign-up failed');
    return {
      status: 'error',
      message: authError?.message ?? 'Could not create an account.',
    };
  }

  const mirror = await createUserMirrorRow({
    authUserId: authResult.user.id,
    email: parsed.data.email,
    displayName: parsed.data.displayName,
    isSeeker: parsed.data.isSeeker,
    isCompanion: parsed.data.isCompanion,
    acceptedGuidelines: true,
  });
  if (!mirror.ok) {
    log.error({ err: mirror.error }, 'mirror row insert failed');
    return { status: 'error', message: mirror.error };
  }

  if (parsed.data.isSeeker) {
    await reconcileSeekerVerification(authResult.user.id);
  }

  if (authResult.session) {
    // Session created (email confirmation disabled for this project).
    redirect('/verify');
  }
  redirect('/check-email');
}
