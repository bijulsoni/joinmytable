import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireSessionUser } from '@/lib/auth/session';
import { avatarPublicUrl } from '@/lib/auth/storage';
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

  const avatarUrl = await avatarPublicUrl(user.profile.avatar_path ?? null);

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <h1 className={styles.heading}>Companion profile</h1>
        <p className={styles.subheading}>
          Tell seekers about you and where you can meet. Verification is required before seekers can
          find or book you.
        </p>
      </header>

      <section className={styles.card} aria-labelledby="photo-heading">
        <h2 id="photo-heading" className={styles.cardHeading}>
          Profile photo
        </h2>
        <p className={styles.cardSubhead}>The first thing seekers see on your profile.</p>
        <div className={styles.photoRow}>
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="Your profile photo" className={styles.photoThumb} />
          ) : (
            <div className={styles.photoPlaceholder} aria-hidden>
              No photo
            </div>
          )}
          <div className={styles.photoMeta}>
            <Link href="/verify" className={styles.photoLink}>
              {avatarUrl ? 'Change photo' : 'Upload a photo'}
            </Link>
            <span className={styles.helpText}>
              JPG, PNG, WEBP, or HEIC, up to 5 MB. Photos are uploaded from the verification screen.
            </span>
          </div>
        </div>
      </section>

      <CompanionProfileSetup />
    </main>
  );
}
