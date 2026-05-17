'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';

const log = logger.child({ module: 'auth.login' });

const LoginSchema = z.object({
  email: z.string().email('Enter a valid email address.'),
  password: z.string().min(1, 'Password is required.'),
});

export type LoginState = { status: 'idle' } | { status: 'error'; message: string };

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = LoginSchema.safeParse({
    email: String(formData.get('email') ?? '')
      .trim()
      .toLowerCase(),
    password: String(formData.get('password') ?? ''),
  });
  if (!parsed.success) {
    return {
      status: 'error',
      message: parsed.error.issues[0]?.message ?? 'Invalid login details.',
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error || !data.user) {
    log.info({ err: error?.message }, 'login failed');
    return {
      status: 'error',
      message: error?.message ?? 'Sign in failed. Check your email and password.',
    };
  }

  redirect('/');
}
