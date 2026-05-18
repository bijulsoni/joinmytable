import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { AppShell } from '@/components/app';
import { LoadingBlock } from '@/components/ui';
import { getSessionUser } from '@/lib/auth/session';
import { RequestForm } from './RequestForm';
import { RequestsHub } from './RequestsHub';

export const metadata: Metadata = {
  title: 'Requests',
};

interface PageProps {
  searchParams: Promise<{ companion?: string; activity?: string }>;
}

// /requests acts as both the new-request form (when ?companion= is set,
// from the companion profile CTA) and as the inbound/outbound hub
// otherwise (the BottomNav tab points here).
export default async function RequestsPage({ searchParams }: PageProps) {
  const user = await getSessionUser();
  if (!user) {
    redirect('/login?next=/requests');
  }

  const params = await searchParams;
  const isForm = typeof params.companion === 'string' && params.companion.length > 0;

  return (
    <AppShell loginRedirectTo="/requests">
      <Suspense fallback={<LoadingBlock />}>{isForm ? <RequestForm /> : <RequestsHub />}</Suspense>
    </AppShell>
  );
}
