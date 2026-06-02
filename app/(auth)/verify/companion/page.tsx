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
    // Tailor the "you're live" message to the tier + founding status.
    const { data: cpRow } = await supabase
      .from('companion_profiles')
      .select('id_verified_at, is_founding')
      .eq('user_id', user.id)
      .maybeSingle();
    const cp = cpRow as { id_verified_at: string | null; is_founding: boolean } | null;
    const fullyVerified = Boolean(cp?.id_verified_at);
    const founding = cp?.is_founding === true;

    return (
      <div className={styles.card}>
        <h1 className={styles.heading}>
          {fullyVerified ? "You're verified ✓" : "You're live in Explore 🎉"}
        </h1>
        <p className={styles.subheading}>
          {fullyVerified
            ? 'Your profile is live with the Verified badge. Seekers can request activities with you, and you can accept and confirm meets.'
            : 'Your profile is live, tagged Basic, and seekers can find and request you. One quick step before you can confirm your first meet: add a photo of your government ID below — we’ll ask for it when your first request comes in.'}
        </p>
        {founding ? (
          <p className={styles.subheading}>
            🌟 <strong>You’re a Founding Companion</strong> — one of Konnly’s first. That means{' '}
            <strong>no platform fee, ever</strong>. Thank you for being early.
          </p>
        ) : null}
        {!fullyVerified ? <CompanionVerifyForm /> : null}
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
