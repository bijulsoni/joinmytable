import { redirect } from 'next/navigation';

// /requests/[id] is now /plans/[id]. Permanent redirect for any
// bookmarked or transactional URL (toasts, email links).
interface RouteContext {
  params: Promise<{ id: string }>;
}
export default async function RequestDetailRedirect(ctx: RouteContext) {
  const { id } = await ctx.params;
  redirect(`/plans/${id}`);
}
