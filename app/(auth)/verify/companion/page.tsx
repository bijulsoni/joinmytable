import type { Metadata } from 'next';
import Link from 'next/link';
import { requireSessionUser } from '@/lib/auth/session';
import { authServerClient } from '@/lib/auth/db';
import type { VerificationStatus } from '@/lib/types';
import { CompanionVerifyForm } from './CompanionVerifyForm';
import styles from '../../styles.module.css';

export const metadata: Metadata = {
  title: 'Identity verification',
};

// Verification flow: government ID + selfie → submit → status flips to
// 'pending'. Admin reviews via scripts/db/verify-companion.mjs and
// approves with --email or rejects with --revoke.
//
// The user's verification_status lives on the `users` row. The
// companion_profiles row may or may not exist yet — we lazy-create
// it on submit if needed so the user doesn't get stuck on a
// "set up your profile first" gate. That older gate caused an infinite
// loop with /profile when the user hadn't gone through onboarding.
export default async function CompanionVerifyPage() {
  const user = await requireSessionUser('/login?next=/verify/companion');

  // Read the canonical verification status from users (NOT
  // companion_profiles — that column doesn't exist).
  const supabase = await authServerClient();
  const { data: row } = await supabase
    .from('users')
    .select('verification_status')
    .eq('id', user.id)
    .maybeSingle();
  const status: VerificationStatus =
    (row as { verification_status: VerificationStatus } | null)?.verification_status ??
    'unverified';

  if (status === 'pending') {
    return (
      <div className={styles.card}>
        <h1 className={styles.heading}>Verification in review</h1>
        <p className={styles.subheading}>
          Thanks — we have what we need. We&apos;ll email you when review is complete (usually
          within a day). Until then, your profile won&apos;t appear in /discover.
        </p>
        <div className={styles.linkRow}>
          <Link href="/discover">Back to discover</Link>
        </div>
      </div>
    );
  }

  if (status === 'verified') {
    return (
      <div className={styles.card}>
        <h1 className={styles.heading}>You&apos;re verified ✓</h1>
        <p className={styles.subheading}>
          Your profile is live in /discover. Seekers can request activities with you, and the
          verified badge shows on your card.
        </p>
        <div className={styles.linkRow}>
          <Link href="/discover">Back to discover</Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <h1 className={styles.heading}>Identity verification</h1>
      <p className={styles.subheading}>
        Konnly is verified-only. Upload a photo of your ID and a quick selfie and we&apos;ll review
        (usually within a day). It&apos;s also what unlocks being a paid companion in /discover.
      </p>
      <CompanionVerifyForm />
    </div>
  );
}
