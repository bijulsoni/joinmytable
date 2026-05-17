import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { BottomNav, BottomNavSpacer } from '@/components/ui';
import { getSessionUser } from '@/lib/auth/session';
import { DiscoverClient } from './DiscoverClient';

export const metadata: Metadata = {
  title: 'Discover companions',
  description: 'Find a verified companion for coffee, lunch, happy hour, or dinner near you.',
};

// /discover is gated on authentication (CLAUDE.md core product rule #10:
// only verified companions are discoverable, but the API itself also
// requires a signed-in caller). The filter UI and results live in a
// client component so we can read geolocation and react to filter
// changes without server round-trips.
export default async function DiscoverPage() {
  const user = await getSessionUser();
  if (!user) {
    redirect('/login?next=/discover');
  }

  return (
    <>
      <DiscoverClient />
      <BottomNavSpacer />
      <BottomNav />
    </>
  );
}
