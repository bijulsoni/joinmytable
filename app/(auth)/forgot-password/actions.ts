'use server';

import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';

const log = logger.child({ module: 'auth.forgot-password' });

const Schema = z.object({
  email: z.string().email('Enter a valid email address.'),
});

export type ForgotState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'sent' };

export async function forgotPasswordAction(
  _prev: ForgotState,
  formData: FormData,
): Promise<ForgotState> {
  const parsed = Schema.safeParse({
    email: String(formData.get('email') ?? '')
      .trim()
      .toLowerCase(),
  });
  if (!parsed.success) {
    return {
      status: 'error',
      message: parsed.error.issues[0]?.message ?? 'Invalid email.',
    };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${appUrl}/callback?next=/reset-password`,
  });

  // Do not leak account existence: always report success, log internally.
  if (error) {
    log.warn({ err: error.message }, 'password reset failed');
  }
  return { status: 'sent' };
}
