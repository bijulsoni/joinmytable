import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app';
import { requireSessionUser } from '@/lib/auth/session';
import { ProfileSetup } from './CompanionProfileSetup';
import styles from './styles.module.css';

export const metadata: Metadata = {
  title: 'Your profile',
  description:
    'Manage your profile — bio, service area, photos, and (optionally) paid companion settings.',
};

// /profile — single, role-neutral profile screen. Anyone signed in
// edits the same page. The "share a meal as a paid companion" block is
// opt-in; flipping it on exposes the activity + rate inputs that make
// the user discoverable as a paid companion once they're verified.
//
//   - Signed out    -> /login
//   - No mirror row -> /verify (the Auth flow finishes provisioning)
export default async function ProfilePage() {
  const user = await requireSessionUser('/login');

  if (!user.profile) {
    redirect('/verify');
  }

  return (
    <AppShell loginRedirectTo="/profile">
      <main className={styles.shell}>
        <header className={styles.header}>
          <h1 className={styles.heading}>Your profile</h1>
          <p className={styles.subheading}>
            How you show up across the app. Tell people about yourself, add a photo, and — if you
            want — opt in to being paid to share a meal as a companion.
          </p>
        </header>

        <ProfileSetup />
      </main>
    </AppShell>
  );
}
