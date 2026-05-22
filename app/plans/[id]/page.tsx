import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { AppShell } from '@/components/app';
import { Badge, EmptyState } from '@/components/ui';
import { DetailHeroPhoto } from './DetailHeroPhoto';
import { getSessionUser } from '@/lib/auth/session';
import {
  ACTIVITY_TYPE_META,
  budgetRangeLabel,
  type ActivityType,
  type BudgetTier,
  type RequestStatus,
} from '@/lib/types';
import { RespondActions } from './RespondActions';
import styles from './styles.module.css';

export const metadata: Metadata = {
  title: 'Request detail',
};

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface RequestDetailResponse {
  request: {
    id: string;
    seeker_id: string;
    companion_id: string;
    activity_type: ActivityType;
    proposed_time: string;
    venue_name: string | null;
    venue_location: string | null;
    budget_tier: BudgetTier | null;
    message: string | null;
    status: RequestStatus;
    created_at: string;
  };
  counterpart: {
    user_id: string | null;
    name: string | null;
    photo_url: string | null;
    photo_urls: string[];
    bio: string | null;
    service_area: string | null;
    rating_avg: number | null;
    verified: boolean;
    activities: ActivityType[];
    rates: Partial<Record<ActivityType, number>>;
  };
  caller_role: 'seeker' | 'companion';
  booking_id: string | null;
}

async function loadDetail(id: string): Promise<RequestDetailResponse | null> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const cookie = h.get('cookie') ?? '';
  if (!host) return null;
  const res = await fetch(`${proto}://${host}/api/requests/${id}`, {
    method: 'GET',
    headers: { Accept: 'application/json', cookie },
    cache: 'no-store',
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Could not load request (${res.status}).`);
  return (await res.json()) as RequestDetailResponse;
}

function formatScheduled(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default async function RequestDetailPage(ctx: RouteContext) {
  const { id } = await ctx.params;
  const session = await getSessionUser();
  if (!session) redirect(`/login?next=/plans/${id}`);

  let data: RequestDetailResponse | null;
  try {
    data = await loadDetail(id);
  } catch (err) {
    return (
      <AppShell loginRedirectTo={`/plans/${id}`}>
        <main className={styles.shell}>
          <div className={styles.errorBox}>{(err as Error).message}</div>
        </main>
      </AppShell>
    );
  }
  if (!data) {
    return (
      <AppShell loginRedirectTo={`/plans/${id}`}>
        <main className={styles.shell}>
          <EmptyState title="Request not found">
            It may have been removed, or you don&apos;t have access to it.
          </EmptyState>
        </main>
      </AppShell>
    );
  }

  const { request: r, counterpart, caller_role, booking_id } = data;
  const activityMeta = ACTIVITY_TYPE_META[r.activity_type];
  const counterpartLabel = caller_role === 'seeker' ? 'Companion' : 'Seeker';

  return (
    <AppShell loginRedirectTo={`/plans/${id}`}>
      <main className={styles.shell}>
        <header className={styles.header}>
          <Link href="/bookings" className={styles.back}>
            ‹ Back to bookings
          </Link>
        </header>

        <section className={styles.profileCard}>
          <DetailHeroPhoto
            name={counterpart.name ?? 'Someone'}
            photos={counterpart.photo_urls ?? []}
          />
          <div className={styles.profileMeta}>
            <span className={styles.profileLabel}>{counterpartLabel}</span>
            <h1 className={styles.profileName}>{counterpart.name ?? 'Someone'}</h1>
            {counterpart.verified ? <span className={styles.verifiedPill}>✓ Verified</span> : null}
            {counterpart.service_area ? (
              <p className={styles.profileMetaLine}>📍 {counterpart.service_area}</p>
            ) : null}
            {counterpart.rating_avg !== null && counterpart.rating_avg > 0 ? (
              <p className={styles.profileMetaLine}>★ {counterpart.rating_avg.toFixed(1)}</p>
            ) : null}
          </div>
        </section>

        {counterpart.bio ? (
          <section className={styles.section}>
            <h2 className={styles.h2}>About</h2>
            <p className={styles.bio}>{counterpart.bio}</p>
          </section>
        ) : null}

        <section className={styles.section}>
          <h2 className={styles.h2}>The request</h2>
          <div className={styles.detailsCard}>
            <DetailRow label="Activity">
              <Badge activity={r.activity_type}>{activityMeta.label}</Badge>
              {counterpart.rates[r.activity_type] !== undefined ? (
                <span className={styles.fee}>· ${counterpart.rates[r.activity_type]} fee</span>
              ) : null}
            </DetailRow>
            <DetailRow label="When">{formatScheduled(r.proposed_time)}</DetailRow>
            {r.venue_name ? (
              <DetailRow label="Venue">
                <strong>{r.venue_name}</strong>
                {r.venue_location ? <span> · {r.venue_location}</span> : null}
              </DetailRow>
            ) : null}
            {r.budget_tier ? (
              <DetailRow label="Budget">
                <strong>{r.budget_tier}</strong>{' '}
                <span className={styles.budgetRange}>
                  · {budgetRangeLabel(r.activity_type, r.budget_tier)} per person
                </span>
              </DetailRow>
            ) : null}
            {r.message ? (
              <DetailRow label="Message">
                <span className={styles.messageQuote}>“{r.message}”</span>
              </DetailRow>
            ) : null}
            <DetailRow label="Status">
              <span className={`${styles.statusPill} ${styles[`status_${r.status}`] ?? ''}`}>
                {r.status}
              </span>
            </DetailRow>
          </div>
        </section>

        <RespondActions
          requestId={r.id}
          status={r.status}
          callerRole={caller_role}
          bookingId={booking_id}
          companionUserId={r.companion_id}
        />
      </main>
    </AppShell>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.detailRow}>
      <span className={styles.detailLabel}>{label}</span>
      <span className={styles.detailValue}>{children}</span>
    </div>
  );
}
