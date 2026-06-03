import type { Metadata } from 'next';
import Link from 'next/link';
import { requireSessionUser } from '@/lib/auth/session';
import { authServerClient } from '@/lib/auth/db';
import styles from '../styles.module.css';

export const metadata: Metadata = {
  title: 'Identity & verification',
};

// Verification hub.
//
//   - Seeker: email confirmation is enough; verification_status stays at
//     'unverified' (informational only — no gating on the seeker side).
//
//   - Companion: an explicit submission flow moves the user's
//     verification_status from 'unverified' to 'pending'. Discovery +
//     booking remain blocked by RLS until an admin moves it to 'verified'.
//
//     There are TWO verified tiers (a single 'verified' status can't tell
//     them apart, so we read companion_profiles.id_verified_at):
//       - Basic  (verified, id_verified_at NULL): discoverable + bookable,
//         but CANNOT confirm a meet until a government ID is added.
//       - Verified (id_verified_at set): full access.
//     A Basic companion MUST be able to reach /verify/companion to upload
//     their ID — otherwise they're stuck (they can accept a request but
//     the accept-gate then demands the ID with nowhere to add it).
export default async function VerifyPage() {
  const user = await requireSessionUser();
  const profile = user.profile;

  // For a verified companion, find out whether they've completed the
  // government-ID step (full) or are still Basic (selfie-only).
  let fullyVerified = false;
  if (profile?.is_companion && profile.verification_status === 'verified') {
    const supabase = await authServerClient();
    const { data: cpRow } = await supabase
      .from('companion_profiles')
      .select('id_verified_at')
      .eq('user_id', user.id)
      .maybeSingle();
    fullyVerified = Boolean((cpRow as { id_verified_at: string | null } | null)?.id_verified_at);
  }

  return (
    <div className={styles.card}>
      <h1 className={styles.heading}>Identity & verification</h1>
      <p className={styles.subheading}>
        Hi {profile?.name ?? user.email}. Finish these steps to get the most out of Konnly.
      </p>

      {/* Email confirmation status */}
      <section>
        <h2 className={styles.label}>1. Email confirmation</h2>
        {user.emailConfirmed ? (
          <div className={styles.success}>Your email is confirmed.</div>
        ) : (
          <div className={styles.notice}>
            We sent a confirmation link to {user.email}. Open it from this device to confirm.
          </div>
        )}
      </section>

      <div className={styles.divider} />

      {/* Companion verification */}
      {profile?.is_companion && (
        <section>
          <h2 className={styles.label}>2. Companion verification</h2>
          <p className={styles.helpText}>
            Companions go through an identity check before they can be discovered or booked.
          </p>
          {profile.verification_status === 'verified' && fullyVerified && (
            <div className={styles.success}>
              You&apos;re verified. Seekers can discover and book you.
            </div>
          )}
          {profile.verification_status === 'verified' && !fullyVerified && (
            <div>
              <div className={styles.success}>
                You&apos;re live as <strong>Basic</strong> — seekers can find and request you.
              </div>
              <p className={styles.helpText}>
                One step left: add a photo of your government ID to earn the{' '}
                <strong>Verified</strong> badge. It&apos;s also required before you can confirm a
                meet, so add it now to avoid getting stuck on your first request.
              </p>
              <Link href="/verify/companion" className={styles.linkAsButton}>
                Add your government ID
              </Link>
            </div>
          )}
          {profile.verification_status === 'pending' && (
            <div className={styles.notice}>
              Verification submitted. We&apos;ll email you when review is done.
            </div>
          )}
          {profile.verification_status === 'unverified' && (
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
