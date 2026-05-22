import type { Metadata } from 'next';
import { AppShell } from '@/components/app';
import { PlansList } from './PlansList';

export const metadata: Metadata = {
  title: 'Plans',
  description: 'Your upcoming and past Konnly plans.',
};

// Unified inbox: pending inbound requests, pending outbound requests,
// confirmed bookings, and history (completed / cancelled / declined).
// One place for users to track every "this thing I have with this person."
export default async function PlansPage() {
  return (
    <AppShell loginRedirectTo="/plans">
      <PlansList />
    </AppShell>
  );
}
