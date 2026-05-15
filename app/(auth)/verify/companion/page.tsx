import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireSessionUser } from '@/lib/auth/session';
import { authServerClient } from '@/lib/auth/db';
import type { VerificationStatus } from '@/lib/types';
import { CompanionVerifyForm } from './CompanionVerifyForm';
import styles from '../../styles.module.css';

interface CompanionRow {
  user_id: string;
  verification_status: VerificationStatus;
}

export const metadata: Metadata = {
  title: 'Companion verification',
};

export default async function CompanionVerifyPage() {
  const user = await requireSessionUser();
  if (!user.profile?.is_companion) {
    redirect('/mode');
  }

  const supabase = await authServerClient();
  const { data: companionRaw } = await supabase
    .from('companion_profiles')
    .select('user_id, verification_status')
    .eq('user_id', user.id)
    .maybeSingle();
  const companion = companionRaw as CompanionRow | null;

  if (!companion) {
    return (
      <div className={styles.card}>
        <h1 className={styles.heading}>Set up your companion profile first</h1>
        <p className={styles.subheading}>
          We need your rate, service area, and availability before we can verify you.
        </p>
        <div className={styles.linkRow}>
          <Link href="/profile">Open companion profile setup</Link>
        </div>
      </div>
    );
  }

  if (companion.verification_status === 'pending') {
    return (
      <div className={styles.card}>
        <h1 className={styles.heading}>Verification in review</h1>
        <p className={styles.subheading}>
          Thanks - we have what we need. We&apos;ll email you when review is complete.
        </p>
        <div className={styles.linkRow}>
          <Link href="/verify">Back to identity</Link>
        </div>
      </div>
    );
  }

  if (companion.verification_status === 'verified') {
    return (
      <div className={styles.card}>
        <h1 className={styles.heading}>You&apos;re verified</h1>
        <p className={styles.subheading}>Seekers can now discover and book you.</p>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <h1 className={styles.heading}>Companion verification</h1>
      <p className={styles.subheading}>
        Verification is required before you can be discovered or booked.
      </p>
      <CompanionVerifyForm />
    </div>
  );
}
