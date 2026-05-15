import type { Metadata } from 'next';
import Link from 'next/link';
import { requireSessionUser } from '@/lib/auth/session';
import { authServerClient } from '@/lib/auth/db';
import { avatarPublicUrl } from '@/lib/auth/storage';
import type { VerificationStatus } from '@/lib/types';
import { AvatarUploader } from '../avatar/AvatarUploader';
import styles from '../styles.module.css';

interface CompanionStateRow {
  user_id: string;
  verification_status: VerificationStatus;
}

export const metadata: Metadata = {
  title: 'Identity & verification',
};

// Verification hub. Renders distinct intensities for the two modes:
//
//   - Seeker (lighter): email confirmation + community guidelines. The
//     gate is automatic; once both are satisfied, seeker_verification
//     _status transitions to 'verified' via reconcileSeekerVerification.
//
//   - Companion (stronger): an explicit submission flow that asks for
//     legal name + an identity document, and moves the companion's
//     verification_status to 'pending'. Discovery + booking remain
//     blocked by RLS until an admin moves it to 'verified'.
//
// We do not surface the third-party identity-check provider here -
// that's a deliberate gap noted in MANUAL CHECKPOINTS.
export default async function VerifyPage() {
  const user = await requireSessionUser();
  const profile = user.profile;

  const supabase = authServerClient();
  const { data: companionRaw } = profile?.is_companion
    ? await supabase
        .from('companion_profiles')
        .select('user_id, verification_status')
        .eq('user_id', user.id)
        .maybeSingle()
    : { data: null };
  const companion = companionRaw as CompanionStateRow | null;

  const avatarUrl = await avatarPublicUrl(profile?.avatar_path ?? null);

  return (
    <div className={styles.card}>
      <h1 className={styles.heading}>Identity & verification</h1>
      <p className={styles.subheading}>
        Hi {profile?.display_name ?? user.email}. Finish these steps to get the
        most out of JoinMyTable.
      </p>

      {/* Email confirmation status */}
      <section>
        <h2 className={styles.label}>1. Email confirmation</h2>
        {user.emailConfirmed ? (
          <div className={styles.success}>Your email is confirmed.</div>
        ) : (
          <div className={styles.notice}>
            We sent a confirmation link to {user.email}. Open it from this device
            to confirm.
          </div>
        )}
      </section>

      <div className={styles.divider} />

      {/* Community guidelines */}
      <section>
        <h2 className={styles.label}>2. Community guidelines</h2>
        {profile?.guidelines_accepted_at ? (
          <div className={styles.success}>
            Accepted on {new Date(profile.guidelines_accepted_at).toLocaleDateString()}.
          </div>
        ) : (
          <form action="/verify/accept-guidelines" method="post">
            <p className={styles.helpText}>
              Read and accept the guidelines so we know you&apos;re on the same
              page as the rest of the community.
            </p>
            <button className={styles.secondary} type="submit">
              I accept the guidelines
            </button>
          </form>
        )}
      </section>

      <div className={styles.divider} />

      {/* Profile photo */}
      <section>
        <h2 className={styles.label}>3. Profile photo</h2>
        <AvatarUploader currentAvatarUrl={avatarUrl} />
      </section>

      <div className={styles.divider} />

      {/* Seeker verification summary */}
      {profile?.is_seeker && (
        <section>
          <h2 className={styles.label}>Seeker status</h2>
          <SeekerStatusPill
            status={profile.seeker_verification_status}
            emailConfirmed={user.emailConfirmed}
            guidelinesAcceptedAt={profile.guidelines_accepted_at}
          />
        </section>
      )}

      {/* Companion verification */}
      {profile?.is_companion && (
        <section>
          <h2 className={styles.label}>Companion verification</h2>
          <p className={styles.helpText}>
            Companions go through a stronger check before they can be discovered
            or booked.
          </p>
          {!companion && (
            <div className={styles.notice}>
              Set up your companion profile (rate, service area, availability)
              first. <Link href="/profile">Open companion profile setup</Link>.
            </div>
          )}
          {companion?.verification_status === 'verified' && (
            <div className={styles.success}>
              You&apos;re verified. Seekers can discover and book you.
            </div>
          )}
          {companion?.verification_status === 'pending' && (
            <div className={styles.notice}>
              Verification submitted. We&apos;ll email you when review is done.
            </div>
          )}
          {companion?.verification_status === 'rejected' && (
            <div className={styles.error}>
              Verification was rejected. <Link href="/verify/companion">Try again</Link>.
            </div>
          )}
          {companion?.verification_status === 'unverified' && (
            <div>
              <Link href="/verify/companion" className={styles.linkAsButton}>
                Start companion verification
              </Link>
            </div>
          )}
        </section>
      )}

      {!profile?.is_companion && (
        <section>
          <Link href="/mode">Want to be a companion? Enable companion mode.</Link>
        </section>
      )}

      <div className={styles.divider} />

      <form action="/logout" method="post">
        <button className={styles.secondary} type="submit">
          Sign out
        </button>
      </form>
    </div>
  );
}

function SeekerStatusPill({
  status,
  emailConfirmed,
  guidelinesAcceptedAt,
}: {
  status: string;
  emailConfirmed: boolean;
  guidelinesAcceptedAt: string | null;
}) {
  if (status === 'verified') {
    return <div className={styles.success}>Seeker verified.</div>;
  }
  const missing: string[] = [];
  if (!emailConfirmed) missing.push('confirm your email');
  if (!guidelinesAcceptedAt) missing.push('accept the community guidelines');
  return (
    <div className={styles.notice}>
      To finish seeker verification: {missing.join(', ')}.
    </div>
  );
}
