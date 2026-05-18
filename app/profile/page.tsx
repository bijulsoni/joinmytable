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

// /profile owns the companion-side profile setup. We gate access at the
// server level so the form never paints for the wrong audience:
//
//   - Signed out      -> /login
//   - No mirror row   -> /verify (Auth & Identity finishes provisioning)
//   - Not in companion mode -> /mode (toggle the flag)
//
// The actual data load happens in the client component so we can show
// loading / empty / error states cleanly against the frozen profiles API.
export default async function CompanionProfilePage() {
  const user = await requireSessionUser('/login');

  if (!user.profile) {
    redirect('/verify');
  }
  if (!user.profile.is_companion) {
    redirect('/mode');
  }

  return (
    <AppShell loginRedirectTo="/profile">
      <main className={styles.shell}>
        <header className={styles.header}>
          <h1 className={styles.heading}>Companion profile</h1>
          <p className={styles.subheading}>
            Tell seekers about you and where you can meet. Verification is required before seekers
            can find or book you.
          </p>
          <p className={styles.helpText}>
            <Link href="/verify" className={styles.photoLink}>
              Identity & verification →
            </Link>
          </p>
        </header>

        <CompanionProfileSetup />
      </main>
    </AppShell>
  );
}
