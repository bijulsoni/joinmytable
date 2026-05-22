import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { EmptyState } from '@/components/ui';
import { StatusMessage } from '@/components/StatusMessage';
import { AppShell } from '@/components/app';
import { getSessionUser } from '@/lib/auth/session';
import { RequestComposer } from './RequestComposer';
import { ProfilePhotoSurface } from './ProfilePhotoSurface';
import { ACTIVITY_TYPES } from '@/lib/types';
import type { PublicCompanionProfileDTO } from '@/app/api/profiles/_lib/types';
import styles from './styles.module.css';

export const metadata: Metadata = {
  title: 'Companion profile',
};

// /companions/[id] - public companion profile.
//
// Wired to the frozen profiles API (GET /api/profiles/[id]). RLS hides
// unverified companions; we return 404 in that case too so we never
// disclose existence.
//
// Page is intentionally lean: hero + the request composer up top, with
// the bio tucked into a tap-to-expand row. Availability windows and the
// reviews placeholder are deliberately not surfaced here — the former
// adds friction without aiding the request flow, and the latter has no
// real data to show until the reviews API ships.

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

  const offered = ACTIVITY_TYPES.filter((a) => profile.activities[a]);

  return (
    <AppShell loginRedirectTo={`/companions/${id}`}>
      <main className={styles.shell}>
        <div className={styles.topbar}>
          <Link href="/discover" className={styles.backLink} aria-label="Back to discover">
            ‹
          </Link>
        </div>

        <ProfilePhotoSurface
          photos={profile.photo_urls}
          name={profile.name}
          meta={
            <div className={styles.heroInfo}>
              <div className={styles.nameRow}>
                <h1 className={styles.name}>{profile.name}</h1>
                <span className={styles.verified}>
                  <span aria-hidden>✓</span> Verified
                </span>
              </div>
              <div className={styles.metaRow}>
                <span className={styles.metaRating}>
                  <span aria-hidden>★</span> {Number(profile.rating_avg).toFixed(1)}
                </span>
                {profile.service_area ? (
                  <span className={styles.metaArea}>
                    <span aria-hidden>📍</span> {profile.service_area}
                  </span>
                ) : null}
              </div>
            </div>
          }
        />

        <section className={styles.section} aria-labelledby="activities-heading">
          <h2 id="activities-heading" className={styles.sectionHeading}>
            Request an activity
          </h2>
          {offered.length === 0 ? (
            <EmptyState title="No activities listed yet" />
          ) : (
            <RequestComposer
              companionId={profile.user_id}
              companionFirstName={profile.name.split(' ')[0] ?? profile.name}
              offered={offered}
              rates={profile.rates}
            />
          )}
        </section>

        {profile.bio ? (
          <details className={styles.aboutDetails}>
            <summary className={styles.aboutSummary}>
              <span>About {profile.name.split(' ')[0]}</span>
              <span className={styles.aboutChevron} aria-hidden>
                ›
              </span>
            </summary>
            <p className={styles.bio}>{profile.bio}</p>
          </details>
        ) : null}
      </main>
    </AppShell>
  );
}
