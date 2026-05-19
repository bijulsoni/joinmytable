import { notFound, redirect } from 'next/navigation';
import { requireSessionUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// /plans/by-booking/[bookingId] — resolves a booking id to its
// canonical /plans/[request_id] URL. Used wherever code only has the
// booking id at hand (BookingsList confirmed-booking rows, chat back
// links). RLS restricts SELECT to participants.

interface RouteContext {
  params: Promise<{ id: string }>;
}

export default async function PlanByBookingPage(ctx: RouteContext) {
  const { id } = await ctx.params;
  await requireSessionUser(`/login?next=/plans/by-booking/${id}`);

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from('bookings').select('request_id').eq('id', id).maybeSingle();

  const requestId = (data as { request_id: string } | null)?.request_id;
  if (!requestId) notFound();

  redirect(`/plans/${requestId}`);
}
