import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'JoinMyTable — Share a meal',
  description:
    'JoinMyTable is a marketplace for lunch and dinner companionship. Sign up as a seeker, a companion, or both.',
};

// Public landing. Signed-in visitors are routed straight to /verify
// (the post-auth hub Auth & Identity exposes). Signed-out visitors get
// the marketing entry with prominent sign-up + login affordances.
export default async function HomePage() {
  const user = await getSessionUser();
  if (user) {
    redirect('/verify');
  }

  return (
    <main className={styles.shell}>
      <section className={styles.hero}>
        <h1 className={styles.headline}>Never eat alone.</h1>
        <p className={styles.lede}>
          JoinMyTable matches you with a companion for lunch or dinner. Seekers cover the meal and a
          flat companionship fee. Companions get paid and eat free.
        </p>

        <div className={styles.ctaRow}>
          <Link href="/sign-up" className={styles.primary}>
            Create an account
          </Link>
          <Link href="/login" className={styles.secondary}>
            I already have an account
          </Link>
        </div>

        <p className={styles.fineprint}>
          One account, two modes. Be a seeker, a companion, or both.
        </p>
      </section>

      <section className={styles.howItWorks} aria-labelledby="how-it-works">
        <h2 id="how-it-works" className={styles.sectionHeading}>
          How it works
        </h2>
        <ol className={styles.steps}>
          <li>
            <strong>Sign up.</strong> Pick seeker, companion, or both. Accept the community
            guidelines.
          </li>
          <li>
            <strong>Find a companion.</strong> Browse verified companions near you, filter by meal
            type and price.
          </li>
          <li>
            <strong>Request a meal.</strong> Pick a lunch or dinner. Chat opens once your companion
            accepts.
          </li>
          <li>
            <strong>Share the table.</strong> Pay the companionship fee up front — we hold it until
            the meal is done.
          </li>
        </ol>
      </section>
    </main>
  );
}
