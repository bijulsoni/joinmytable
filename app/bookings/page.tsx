import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { BottomNav, BottomNavSpacer } from '@/components/ui';
import { getSessionUser } from '@/lib/auth/session';
import { BookingsList } from './BookingsList';

export const metadata: Metadata = {
  title: 'Bookings',
  description: 'Your upcoming and past JoinMyTable bookings.',
};

export default async function BookingsPage() {
  const user = await getSessionUser();
  if (!user) {
    redirect('/login?next=/bookings');
  }

  return (
    <>
      <BookingsList />
      <BottomNavSpacer />
      <BottomNav />
    </>
  );
}
