import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app';
import { requireSessionUser } from '@/lib/auth/session';
import { WelcomeForm } from './WelcomeForm';
import styles from './styles.module.css';

export const metadata: Metadata = {
  title: 'Welcome to JoinMyTable',
  description: 'Add a few photos, a bio, and (optionally) list yourself as a paid companion.',
};

// /welcome — first-run onboarding. The new sign-up flow drops the user
// here right after email confirmation (or immediately, if confirmation
// is off). They can add photos, a bio, and toggle on paid-companion
// mode in one place — no bouncing to /profile after sign-up.
//
// All fields are optional. The "Continue" button always proceeds; it
// stamps users.onboarded_at = now() so future logins route to /discover.
//
//   - Signed out                 -> /login?next=/welcome
//   - Signed in + onboarded_at?  -> /discover
//   - Signed in + still null     -> render the form
export default async function WelcomePage() {
  const user = await requireSessionUser('/login?next=/welcome');

  // The auth callback creates the auth.users row but the mirror row
  // may not exist yet for some pre-existing accounts. Bounce them
  // through /verify to finish provisioning.
  if (!user.profile) {
    redirect('/verify');
  }

  if (user.profile.onboarded_at) {
    redirect('/discover');
  }

  return (
    <AppShell loginRedirectTo="/welcome">
      <main className={styles.shell}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>Welcome to JoinMyTable</p>
          <h1 className={styles.heading}>
            A little about <span className={styles.headingAccent}>you</span>
          </h1>
          <p className={styles.subheading}>
            All optional — you can update anything later from your profile. Hit Continue when
            you&apos;re done, even if it&apos;s blank.
          </p>
        </header>

        <WelcomeForm initialName={user.profile.name} />
      </main>
    </AppShell>
  );
}
