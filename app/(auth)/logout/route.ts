// POST /logout - sign the current session out.
//
// Implemented as a route handler so it can be invoked from a plain
// <form action="/logout" method="post"> without client-side JS.

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const supabase = createSupabaseServerClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/login', request.url), {
    status: 303,
  });
}
