import type { Metadata } from 'next';
import { AppShell } from '@/components/app';
import { BookingsList } from './BookingsList';

export const metadata: Metadata = {
  title: 'Bookings',
  description: 'Your upcoming and past JoinMyTable bookings.',
};

export default async function BookingsPage() {
  return (
    <AppShell loginRedirectTo="/bookings">
      <BookingsList />
    </AppShell>
  );
}
