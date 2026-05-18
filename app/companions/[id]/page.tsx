import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { Avatar, Badge, Button, Card, EmptyState } from '@/components/ui';
import { ActivityIcon } from '@/components/activity';
import { StatusMessage } from '@/components/StatusMessage';
import { AppShell } from '@/components/app';
import { getSessionUser } from '@/lib/auth/session';
import { ACTIVITY_TYPES, ACTIVITY_TYPE_META, type ActivityType } from '@/lib/types';
import type { PublicCompanionProfileDTO } from '@/app/api/profiles/_lib/types';
import styles from './styles.module.css';

export const metadata: Metadata = {
  title: 'Companion profile',
};

// /companions/[id] - public companion profile.
//
// Wired to the frozen profiles API (GET /api/profiles/[id]). RLS hides
// unverified companions; we return 404 in that case too so we never
// disclose existence. Reviews list is rendered against a placeholder
// until /api/reviews/companion/[id] ships (Core API + Trust & Safety).

interface ProfileResponse {
  profile: PublicCompanionProfileDTO;
}

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function loadProfile(id: string): Promise<PublicCompanionProfileDTO | null> {
  // Server-side fetches need an absolute origin. Pull host + proto from
  // the incoming request rather than baking an env var in: the Frontend
  // agent does not own deployment config.
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const cookie = h.get('cookie') ?? '';
  if (!host) return null;
  const url = `${proto}://${host}/api/profiles/${id}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json', cookie },
    cache: 'no-store',
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Profile fetch failed (${res.status}).`);
  }
  const body = (await res.json()) as ProfileResponse;
  return body.profile;
}

export default async function CompanionPublicProfilePage(ctx: RouteContext) {
  const { id } = await ctx.params;
  const session = await getSessionUser();
  if (!session) {
    redirect(`/login?next=/companions/${id}`);
  }

  let profile: PublicCompanionProfileDTO | null = null;
  let loadError: string | null = null;
  try {
    profile = await loadProfile(id);
  } catch (err) {
    loadError = err instanceof Error ? err.message : 'Could not load companion profile.';
  }

  if (loadError) {
    return (
      <AppShell loginRedirectTo={`/companions/${id}`}>
        <main className={styles.shell}>
          <div className={styles.errorBox}>
            <StatusMessage tone="error">{loadError}</StatusMessage>
          </div>
        </main>
      </AppShell>
    );
  }

  if (!profile) {
    notFound();
  }

  const headerPhoto = profile.photo_urls[0] ?? null;
  const offered = ACTIVITY_TYPES.filter((a) => profile.activities[a]);
  const defaultActivity: ActivityType = offered[0] ?? 'lunch';
  const requestHref = `/requests?companion=${profile.user_id}&activity=${defaultActivity}`;

  return (
    <AppShell loginRedirectTo={`/companions/${id}`}>
      <main className={styles.shell}>
        <div className={styles.headerImage}>
          {headerPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={headerPhoto} alt={`${profile.name}'s photo`} />
          ) : (
            <div className={styles.headerFallback} aria-hidden>
              <Avatar src={null} name={profile.name} size={96} />
            </div>
          )}
          <Link href="/discover" className={styles.backLink} aria-label="Back to discover">
            ‹
          </Link>
        </div>

        <section className={styles.summary}>
          <div className={styles.nameRow}>
            <h1 className={styles.name}>{profile.name}</h1>
            <span className={styles.verified}>
              <span aria-hidden>✓</span> Verified
            </span>
          </div>
          <div className={styles.metaRow}>
            <span>★ {Number(profile.rating_avg).toFixed(1)}</span>
            {profile.service_area ? <span>· {profile.service_area}</span> : null}
          </div>
        </section>

        <section className={styles.section} aria-labelledby="activities-heading">
          <h2 id="activities-heading" className={styles.sectionHeading}>
            Activities offered
          </h2>
          {offered.length === 0 ? (
            <EmptyState title="No activities listed yet" />
          ) : (
            <div className={styles.ratesList}>
              {offered.map((activity) => {
                const meta = ACTIVITY_TYPE_META[activity];
                const rate = profile.rates[activity];
                return (
                  <div key={activity} className={styles.rateRow} data-activity={activity}>
                    <span className={styles.rateIcon}>
                      <ActivityIcon activity={activity} />
                    </span>
                    <span className={styles.rateLabel}>{meta.label}</span>
                    <span className={styles.rateValue}>
                      {rate !== undefined ? `$${rate}` : '—'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {profile.bio ? (
          <section className={styles.section} aria-labelledby="bio-heading">
            <h2 id="bio-heading" className={styles.sectionHeading}>
              About
            </h2>
            <p className={styles.bio}>{profile.bio}</p>
          </section>
        ) : null}

        <section className={styles.section} aria-labelledby="availability-heading">
          <h2 id="availability-heading" className={styles.sectionHeading}>
            Availability
          </h2>
          {profile.availability.length === 0 ? (
            <EmptyState title="No availability windows posted yet">
              Send a request with your preferred time and {profile.name.split(' ')[0]} can confirm.
            </EmptyState>
          ) : (
            <div className={styles.ratesList}>
              {profile.availability.map((slot) => (
                <Card key={slot.id} variant="flat">
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '0.75rem',
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>{slot.day_or_date}</span>
                    <span style={{ color: 'var(--color-text-secondary)' }}>{slot.time_range}</span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '0.25rem',
                      marginTop: '0.5rem',
                    }}
                  >
                    {slot.activity_types.map((a) => (
                      <Badge key={a} activity={a} />
                    ))}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>

        <section className={styles.section} aria-labelledby="reviews-heading">
          <h2 id="reviews-heading" className={styles.sectionHeading}>
            Reviews
          </h2>
          {/*
          The /api/reviews/companion/[id] endpoint is not live yet
          (planned for Phase 5 — Trust & Safety). Until then we render a
          friendly placeholder rather than a broken list.
        */}
          <EmptyState title="Reviews coming soon">
            We&apos;ll show reviews from past meet-ups here as soon as the reviews API ships.
          </EmptyState>
        </section>

        <div className={styles.stickyCta}>
          <Button as={Link} href={requestHref} fullWidth>
            Request {ACTIVITY_TYPE_META[defaultActivity].label.toLowerCase()}
          </Button>
        </div>
      </main>
    </AppShell>
  );
}
