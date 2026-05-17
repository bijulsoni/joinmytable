'use server';

// Server action backing the sign-up form. Steps:
//   1. Validate the payload (zod).
//   2. Call Supabase Auth signUp (email + password).
//   3. Insert the public.users mirror row with the chosen modes.
//   4. If a session was returned (email confirmation disabled), redirect
//      to the verification screen so the seeker/companion can finish
//      setup; otherwise route to a "check your inbox" notice.

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createUserMirrorRow } from '@/lib/auth/profile';
import { logger } from '@/lib/logger';

const log = logger.child({ module: 'auth.sign-up' });

const SignUpSchema = z
  .object({
    email: z.string().email('Enter a valid email address.'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters.')
      .max(72, 'Password is too long.'),
    name: z.string().min(1, 'Name is required.').max(80, 'Name is too long.'),
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
    name: String(formData.get('name') ?? '').trim(),
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
      data: { name: parsed.data.name },
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
    name: parsed.data.name,
    isSeeker: parsed.data.isSeeker,
    isCompanion: parsed.data.isCompanion,
  });
  if (!mirror.ok) {
    log.error({ err: mirror.error }, 'mirror row insert failed');
    return { status: 'error', message: mirror.error };
  }

  if (authResult.session) {
    redirect('/verify');
  }
  redirect('/check-email');
}
