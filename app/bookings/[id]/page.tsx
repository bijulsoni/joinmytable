import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { BottomNav, BottomNavSpacer } from '@/components/ui';
import { getSessionUser } from '@/lib/auth/session';
import { ConfirmAndPay } from './ConfirmAndPay';

export const metadata: Metadata = {
  title: 'Confirm & pay',
};

interface RouteContext {
  params: Promise<{ id: string }>;
}

export default async function BookingDetailPage(ctx: RouteContext) {
  const { id } = await ctx.params;
  const user = await getSessionUser();
  if (!user) {
    redirect(`/login?next=/bookings/${id}`);
  }

  return (
    <>
      <ConfirmAndPay bookingId={id} />
      <BottomNavSpacer />
      <BottomNav />
    </>
  );
}
