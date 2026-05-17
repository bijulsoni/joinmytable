import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui';
import { ActivityIcon } from '@/components/activity';
import { getSessionUser } from '@/lib/auth/session';
import { ACTIVITY_TYPE_META, type ActivityType } from '@/lib/types';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'JoinMyTable — Never lunch alone again',
  description:
    'A two-sided marketplace for shared-activity companionship. Find a companion for coffee, lunch, happy hour, or dinner.',
};

// Public landing page. Signed-in visitors are routed straight to the
// post-auth hub. Signed-out visitors get a warm, mobile-first marketing
// surface with two paths in: become a seeker or a companion.
//
// The hero rotates through the four activities by leaning on the
// `--activity` custom property so the headline accent stays color-aware
// without us hard-coding a token.

const ACTIVITY_COPY: Record<ActivityType, string> = {
  coffee: 'A warm cup, a real conversation.',
  lunch: 'Midday break, better with company.',
  happy_hour: 'End the day over a drink.',
  dinner: 'A table set for two.',
};

const HERO_ACTIVITY: ActivityType = 'lunch';

export default async function HomePage() {
  const user = await getSessionUser();
  if (user) {
    redirect('/discover');
  }

  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <Link href="/" className={styles.wordmark}>
          JoinMyTable
        </Link>
        <Link href="/login" className={styles.topbarLogin}>
          Sign in
        </Link>
      </header>

      <section className={styles.hero} data-activity={HERO_ACTIVITY}>
        <p className={styles.eyebrow}>Coffee · Lunch · Happy hour · Dinner</p>
        <h1 className={styles.headline}>
          Never <span className={styles.headlineSpan}>lunch</span> alone again.
        </h1>
        <p className={styles.lede}>
          JoinMyTable matches you with a friendly, verified companion for a meal, a drink, or a
          coffee. You cover the activity and a flat fee. They show up and make it better.
        </p>

        <div className={styles.ctaRow}>
          <Button as="a" href="/sign-up?mode=seeker">
            Find a companion
          </Button>
          <Button as="a" href="/sign-up?mode=companion" variant="secondary">
            Become a companion
          </Button>
        </div>
      </section>

      <section className={styles.activities} aria-labelledby="activities-heading">
        <h2 id="activities-heading" className={styles.activitiesHeading}>
          Four ways to share a table
        </h2>
        <ul className={styles.activityList}>
          {(['coffee', 'lunch', 'happy_hour', 'dinner'] as const).map((activity) => {
            const meta = ACTIVITY_TYPE_META[activity];
            return (
              <li key={activity} className={styles.activityCard} data-activity={activity}>
                <span className={styles.activityIcon}>
                  <ActivityIcon activity={activity} width={20} height={20} />
                </span>
                <span className={styles.activityName}>{meta.label}</span>
                <p className={styles.activityCopy}>{ACTIVITY_COPY[activity]}</p>
              </li>
            );
          })}
        </ul>
      </section>

      <section className={styles.howSection} aria-labelledby="how-it-works">
        <div className={styles.howCard}>
          <h2 id="how-it-works" className={styles.sectionHeading}>
            How it works
          </h2>
          <ol className={styles.steps}>
            <li>
              <strong>Sign up.</strong> Be a seeker, a companion, or both — one account, two modes.
            </li>
            <li>
              <strong>Find a companion.</strong> Filter by activity, time, and price tier near you.
            </li>
            <li>
              <strong>Request a meet.</strong> Chat opens the moment your companion accepts.
            </li>
            <li>
              <strong>Meet up.</strong> Your fee is held safely until after the activity wraps.
            </li>
          </ol>
        </div>
      </section>

      <footer className={styles.footer}>
        <p>
          Public venues only. Verified companions only.{' '}
          <Link href="/safety">Safety &amp; community</Link>.
        </p>
      </footer>
    </main>
  );
}
