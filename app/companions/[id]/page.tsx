import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { EmptyState } from '@/components/ui';
import { StatusMessage } from '@/components/StatusMessage';
import { AppShell } from '@/components/app';
import { getSessionUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { loadPublicCompanionProfile } from '@/app/api/profiles/_lib/load';
import { RequestComposer } from './RequestComposer';
import { ProfilePhotoSurface } from './ProfilePhotoSurface';
import { ACTIVITY_TYPES } from '@/lib/types';
import type { LooseSupabaseClient } from '@/app/api/_lib';
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

interface RouteContext {
  params: Promise<{ id: string }>;
}

export default async function CompanionPublicProfilePage(ctx: RouteContext) {
  const { id } = await ctx.params;
  const session = await getSessionUser();
  if (!session) {
    redirect(`/login?next=/companions/${id}`);
  }

  // Load the profile DIRECTLY in-process (RLS-scoped) instead of fetching
  // our own /api/profiles/[id] over HTTP — that self-round-trip re-ran
  // auth (a second getUser) on top of the page's, the single biggest
  // chunk of this page's old load time.
  let profile: PublicCompanionProfileDTO | null = null;
  let loadError: string | null = null;
  try {
    const supabase = (await createSupabaseServerClient()) as unknown as LooseSupabaseClient;
    profile = await loadPublicCompanionProfile(supabase, id);
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
                {profile.fully_verified ? (
                  <span className={styles.verified} title="Government ID verified">
                    <span aria-hidden>✓</span> Verified
                  </span>
                ) : (
                  <span
                    className={styles.basicTag}
                    title="Selfie reviewed. Confirms ID before a meet is booked."
                  >
                    Basic
                  </span>
                )}
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
