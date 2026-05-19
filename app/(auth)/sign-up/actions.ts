'use server';

// Server action backing the sign-up form.
//
// The seeker/companion mode toggle was removed — every user is now a
// seeker by default (they can send requests) and becomes discoverable
// as a companion by setting up a verified companion profile from
// /profile after sign-up. The legacy is_seeker/is_companion columns
// still exist on `users` (DB CHECK constraint requires at least one);
// we default both to true so seeded data stays consistent and so a
// freshly signed-up user can immediately start a companion profile if
// they want without flipping flags first.

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createUserMirrorRow } from '@/lib/auth/profile';
import { logger } from '@/lib/logger';

const log = logger.child({ module: 'auth.sign-up' });

const SignUpSchema = z.object({
  email: z.string().email('Enter a valid email address.'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters.')
    .max(72, 'Password is too long.'),
  name: z.string().min(1, 'Name is required.').max(80, 'Name is too long.'),
  acceptGuidelines: z
    .boolean()
    .refine((v) => v === true, 'You must accept the community guidelines.'),
});

export type SignUpState = { status: 'idle' } | { status: 'error'; message: string };

export async function signUpAction(_prev: SignUpState, formData: FormData): Promise<SignUpState> {
  const parsed = SignUpSchema.safeParse({
    email: String(formData.get('email') ?? '')
      .trim()
      .toLowerCase(),
    password: String(formData.get('password') ?? ''),
    name: String(formData.get('name') ?? '').trim(),
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

  // Both flags default to true. The user is_seeker (everyone can send
  // requests) — and is_companion is kept on so that companion-profile
  // setup is one-step (no flag flip). Discoverability is gated on the
  // companion_profiles row's verified_at, not on this flag.
  const mirror = await createUserMirrorRow({
    authUserId: authResult.user.id,
    email: parsed.data.email,
    name: parsed.data.name,
    isSeeker: true,
    isCompanion: true,
  });
  if (!mirror.ok) {
    log.error({ err: mirror.error }, 'mirror row insert failed');
    return { status: 'error', message: mirror.error };
  }

  if (authResult.session) {
    redirect('/discover');
  }
  redirect('/check-email');
}
