import type { Metadata } from 'next';
import { AppShell } from '@/components/app';
import { ConfirmAndPay } from './ConfirmAndPay';

export const metadata: Metadata = {
  title: 'Booking',
};

interface RouteContext {
  params: Promise<{ id: string }>;
}

export default async function BookingDetailPage(ctx: RouteContext) {
  const { id } = await ctx.params;
  return (
    <AppShell loginRedirectTo={`/bookings/${id}`}>
      <ConfirmAndPay bookingId={id} />
    </AppShell>
  );
}
