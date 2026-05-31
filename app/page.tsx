import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui';
import { ActivityIcon } from '@/components/activity';
import { getSessionUser } from '@/lib/auth/session';
import { homePathForUser } from '@/lib/auth/home-path';
import { ACTIVITY_TYPE_META, type ActivityType } from '@/lib/types';
import { RotatingActivity } from './RotatingActivity';
import { BetaBadge } from '@/components/app/BetaBadge';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Konnly — Real plans with real people',
  description:
    'Konnly connects you with friendly, verified people for real-life plans. Today: coffee, lunch, happy hour, dinner. More activities on the way.',
};

const ACTIVITY_COPY: Record<ActivityType, string> = {
  coffee: 'A warm cup, a real conversation.',
  lunch: 'Midday break, better with company.',
  happy_hour: 'End the day over a drink.',
  dinner: 'A table set for two.',
};

export default async function HomePage() {
  const user = await getSessionUser();
  if (user) {
    redirect(homePathForUser(user.profile));
  }

  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <Link href="/" className={styles.wordmark}>
          <span className={styles.wordmarkMark}>◖</span>
          Konnly
          <BetaBadge />
        </Link>
        <Link href="/login" className={styles.topbarLogin}>
          Sign in
        </Link>
      </header>

      <section className={styles.hero}>
        <RotatingActivity />

        <p className={styles.tagline}>The more AI does, the more human you get to be.</p>

        <p className={styles.lede}>
          As our tools take over the busywork, the time we get back is best spent on what makes us
          human — real connection. Konnly turns that time into real plans with real people: coffee,
          lunch, happy hour, dinner, with a friendly, verified companion who shows up and makes it
          better.
        </p>

        <p className={styles.betaNote}>
          🌲 Now in private beta in the <strong>Seattle–Bellevue area</strong>. Elsewhere? Sign up
          and we’ll add you to the waitlist for your city.
        </p>

        <div className={styles.ctaRow}>
          <Button as="a" href="/sign-up">
            Create your account
          </Button>
          <Button as="a" href="/login" variant="secondary">
            Sign in
          </Button>
        </div>

        <p className={styles.heroProof}>
          <span className={styles.heroProofDots}>
            <span />
            <span />
            <span />
            <span />
          </span>
          Four activities today. More on the way. Public venues only.
        </p>
      </section>

      <section className={styles.activities} aria-labelledby="activities-heading">
        <h2 id="activities-heading" className={styles.activitiesHeading}>
          Four ways to start
        </h2>
        <ul className={styles.activityList}>
          {(['coffee', 'lunch', 'happy_hour', 'dinner'] as const).map((activity) => {
            const meta = ACTIVITY_TYPE_META[activity];
            return (
              <li key={activity} className={styles.activityCard} data-activity={activity}>
                <span className={styles.activityIcon}>
                  <ActivityIcon activity={activity} width={22} height={22} />
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
              <span>
                <strong>Sign up with your email.</strong> Add a few photos and a short bio.
              </span>
            </li>
            <li>
              <span>
                <strong>Browse nearby companions.</strong> Filter by activity, distance, and rating.
              </span>
            </li>
            <li>
              <span>
                <strong>Send a request.</strong> Chat opens the moment they accept.
              </span>
            </li>
            <li>
              <span>
                <strong>Meet up.</strong> Your fee is held safely until after.
              </span>
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
