import 'server-only';

// POST /api/_test/login — dev-only login helper for the E2E test harness.
//
// Bypasses the marketing-style /login server action so the harness can
// authenticate via fetch (the action redirects on success, which is hard
// to drive from a Node test). The Supabase cookie is set on the
// response by the cookie adapter inside createSupabaseServerClient.
//
// Hard-gated to non-production environments.

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'disabled' }, { status: 404 });
  }

  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  if (!body.email || !body.password) {
    return NextResponse.json({ error: 'email and password required' }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: body.email,
    password: body.password,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  return NextResponse.json({
    user_id: data.user?.id ?? null,
    email: data.user?.email ?? null,
  });
}
