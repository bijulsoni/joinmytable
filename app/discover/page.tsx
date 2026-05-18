import type { Metadata } from 'next';
import { AppShell } from '@/components/app';
import { requireSessionUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { DiscoverFeed, type FeedCompanion } from './DiscoverFeed';
import type { ActivityType } from '@/lib/types';
import { ACTIVITY_TYPES } from '@/lib/types';

export const metadata: Metadata = {
  title: 'Discover companions',
  description: 'Browse verified companions for coffee, lunch, happy hour, and dinner.',
};

interface CompanionRow {
  id: string;
  user_id: string;
  bio: string | null;
  service_area: string | null;
  activities: Record<string, boolean> | null;
  rates: Record<string, number> | null;
  photo_urls: string[] | null;
  rating_avg: string | number | null;
  verified_at: string | null;
  users: { name: string | null } | null;
}

function pickActivities(raw: Record<string, boolean> | null): ActivityType[] {
  if (!raw) return [];
  return ACTIVITY_TYPES.filter((a) => raw[a] === true);
}

function pickRates(raw: Record<string, number> | null): Partial<Record<ActivityType, number>> {
  const out: Partial<Record<ActivityType, number>> = {};
  if (!raw) return out;
  for (const a of ACTIVITY_TYPES) {
    const r = raw[a];
    if (typeof r === 'number' && r > 0) out[a] = r;
  }
  return out;
}

export default async function DiscoverPage() {
  // AppShell handles the auth redirect, but we still need the session here
  // for the data fetch (server Supabase client is request-scoped).
  await requireSessionUser('/login?next=/discover');

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('companion_profiles')
    .select(
      'id, user_id, bio, service_area, activities, rates, photo_urls, rating_avg, verified_at, users:users!inner(name)',
    )
    .not('verified_at', 'is', null)
    .order('rating_avg', { ascending: false, nullsFirst: false })
    .limit(60);

  const rows = (data ?? []) as unknown as CompanionRow[];
  const companions: FeedCompanion[] = rows.map((row) => ({
    user_id: row.user_id,
    name: row.users?.name ?? 'A companion',
    bio: row.bio,
    service_area: row.service_area,
    photo_url: row.photo_urls?.[0] ?? null,
    rating_avg: row.rating_avg === null ? null : Number(row.rating_avg),
    activities: pickActivities(row.activities),
    rates: pickRates(row.rates),
    verified: row.verified_at !== null,
  }));

  return (
    <AppShell loginRedirectTo="/discover">
      <DiscoverFeed companions={companions} fetchError={error?.message ?? null} />
    </AppShell>
  );
}
