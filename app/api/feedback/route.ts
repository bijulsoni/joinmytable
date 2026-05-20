// POST /api/feedback — in-app "Report an issue" submissions during the
// closed beta. Anyone signed in can post. Each row carries the user's
// id (server-derived, never client-claimed), a category, free-text
// body, and the URL the user was on when they hit the button.
//
// Reads are admin-only (service role bypasses RLS). No GET endpoint
// here on purpose — read via the database directly.

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError, parseJsonBody, requireAuth } from '@/app/api/_lib';

export const dynamic = 'force-dynamic';

const FeedbackSchema = z.object({
  category: z.enum(['bug', 'idea', 'complaint', 'other']),
  body: z.string().min(1, 'Tell us what you saw.').max(4000, 'That’s a long one — trim it down.'),
  url: z.string().max(2000).optional().nullable(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { caller } = auth;

  const parsed = await parseJsonBody(request, FeedbackSchema);
  if (!parsed.ok) return parsed.response;
  const input = parsed.data;

  const { error } = await caller.supabase.from('feedback_reports').insert({
    user_id: caller.userId,
    category: input.category,
    body: input.body.trim(),
    url: input.url?.trim() || null,
  });
  if (error) {
    return apiError('internal_error', error.message || 'Could not save your report.');
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}
