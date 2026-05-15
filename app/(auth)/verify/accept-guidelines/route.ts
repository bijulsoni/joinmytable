// POST /verify/accept-guidelines - record community guidelines
// acceptance for the signed-in user, then send them back to the
// verification hub.

import { NextResponse } from 'next/server';
import { acceptGuidelines } from '@/lib/auth/profile';
import { reconcileSeekerVerification } from '@/lib/auth/verification';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const supabase = createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.redirect(new URL('/login', request.url), { status: 303 });
  }

  await acceptGuidelines();
  await reconcileSeekerVerification(auth.user.id);

  return NextResponse.redirect(new URL('/verify', request.url), { status: 303 });
}
