import { redirect } from 'next/navigation';

// /bookings/[id] now lives at /plans/by-booking/[id] (which then 308s
// to /plans/[request_id]). Permanent redirect for backwards compat.
interface RouteContext {
  params: Promise<{ id: string }>;
}
export default async function BookingDetailRedirect(ctx: RouteContext) {
  const { id } = await ctx.params;
  redirect(`/plans/by-booking/${id}`);
}
