import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app';
import { requireSessionUser } from '@/lib/auth/session';
import { CompanionProfileSetup } from './CompanionProfileSetup';
import styles from './styles.module.css';

export const metadata: Metadata = {
  title: 'Companion profile',
  description: 'Set up your companion profile — rate, service area, meal types, and availability.',
};

// /profile — companion profile setup. Anyone signed in can land here
// and decide whether to set up + verify a companion profile. Becoming
// discoverable is gated on the resulting companion_profiles row (and
// its verified_at), not on a per-user mode flag.
//
//   - Signed out    -> /login
//   - No mirror row -> /verify (the Auth flow finishes provisioning)
//
// The actual data load happens in the client component so we can show
// loading / empty / error states cleanly against the frozen profiles
// API.
export default async function CompanionProfilePage() {
  const user = await requireSessionUser('/login');

  if (!user.profile) {
    redirect('/verify');
  }

  return (
    <AppShell loginRedirectTo="/profile">
      <main className={styles.shell}>
        <header className={styles.header}>
          <h1 className={styles.heading}>Companion profile</h1>
          <p className={styles.subheading}>
            Want to share a meal as a paid companion? Set up your profile and verify your identity —
            seekers can discover and book you once both are in place.
          </p>
          <p className={styles.helpText}>
            <Link href="/verify" className={styles.photoLink}>
              Identity &amp; verification →
            </Link>
          </p>
        </header>

        <CompanionProfileSetup />
      </main>
    </AppShell>
  );
}
