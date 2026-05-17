import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { BottomNav, BottomNavSpacer, LoadingBlock } from '@/components/ui';
import { getSessionUser } from '@/lib/auth/session';
import { RequestForm } from './RequestForm';

export const metadata: Metadata = {
  title: 'Request a meet',
  description: 'Send a meal, coffee, or happy-hour request to a verified companion.',
};

// /requests - new-request form. The companion id arrives as a query
// param (?companion=<uuid>), so the form is a client component that
// reads useSearchParams(). The page wrapper enforces auth and renders
// the bottom nav.
export default async function NewRequestPage() {
  const user = await getSessionUser();
  if (!user) {
    redirect('/login?next=/requests');
  }

  return (
    <>
      <Suspense fallback={<LoadingBlock />}>
        <RequestForm />
      </Suspense>
      <BottomNavSpacer />
      <BottomNav />
    </>
  );
}
