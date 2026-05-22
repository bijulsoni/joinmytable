import type { Metadata } from 'next';
import Link from 'next/link';
import { requireSessionUser } from '@/lib/auth/session';
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
export default async function VerifyPage() {
  const user = await requireSessionUser();
  const profile = user.profile;

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
          {profile.verification_status === 'verified' && (
            <div className={styles.success}>
              You&apos;re verified. Seekers can discover and book you.
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
