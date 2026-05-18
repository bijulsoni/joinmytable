import 'server-only';

// GET /api/reviews/companion/[id]
//
// Public list of reviews for a given companion (reviewee = companion's
// user id). RLS allows anonymous reads on reviews; we still call through
// the request-scoped client so future tightening is one config change.

import { NextResponse } from 'next/server';
import { apiError } from '@/app/api/_lib';
import { apiServerClient } from '@/app/api/_lib/supabase';
import { uuidSchema } from '@/app/api/_lib/validators';

interface ReviewRow {
  id: string;
  booking_id: string;
  reviewer_id: string;
  reviewee_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  reviewer: { name: string | null }[] | { name: string | null } | null;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await ctx.params;
  const idResult = uuidSchema.safeParse(rawId);
  if (!idResult.success) {
    return apiError('invalid_input', 'Invalid companion id.');
  }
  const companionId = idResult.data;

  const supabase = await apiServerClient();
  const { data, error } = await supabase
    .from('reviews')
    .select(
      `id, booking_id, reviewer_id, reviewee_id, rating, comment, created_at,
       reviewer:users!reviews_reviewer_id_fkey(name)`,
    )
    .eq('reviewee_id', companionId)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    return apiError('internal_error', `Could not load reviews: ${error.message}`);
  }

  const rows = (data ?? []) as unknown as ReviewRow[];
  const reviews = rows.map((r) => {
    const reviewerObj = Array.isArray(r.reviewer) ? r.reviewer[0] : r.reviewer;
    return {
      id: r.id,
      booking_id: r.booking_id,
      reviewer_id: r.reviewer_id,
      reviewee_id: r.reviewee_id,
      rating: r.rating,
      comment: r.comment,
      created_at: r.created_at,
      reviewer_name: reviewerObj?.name ?? 'Someone',
    };
  });

  return NextResponse.json({ reviews });
}
