import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { AppShell } from '@/components/app';
import { LoadingBlock } from '@/components/ui';
import { getSessionUser } from '@/lib/auth/session';
import { RequestForm } from './RequestForm';

export const metadata: Metadata = {
  title: 'New request',
};

interface PageProps {
  searchParams: Promise<{ companion?: string; activity?: string }>;
}

// /requests is now the "compose a new request" form when ?companion= is
// present (from a companion profile CTA). Without that param it
// redirects into /plans — the merged inbox replaces the old requests
// hub.
export default async function RequestsPage({ searchParams }: PageProps) {
  const user = await getSessionUser();
  if (!user) {
    redirect('/login?next=/plans');
  }

  const params = await searchParams;
  const isForm = typeof params.companion === 'string' && params.companion.length > 0;
  if (!isForm) {
    redirect('/plans');
  }

  return (
    <AppShell loginRedirectTo="/plans">
      <Suspense fallback={<LoadingBlock />}>
        <RequestForm />
      </Suspense>
    </AppShell>
  );
}
