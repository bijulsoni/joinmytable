import type { Metadata } from 'next';
import Link from 'next/link';
import styles from './styles.module.css';

export const metadata: Metadata = {
  title: 'Safety & community',
  description:
    'How Konnly keeps coffee, lunch, happy hour, and dinner meetings safe — public venues only, verified companions, in-app messaging, and held escrow.',
};

// Public-facing safety + community page. Linked from the landing footer.
// Full Trust & Safety surfaces (report, block, share-with-a-friend) land
// in Phase 5; for now this page documents the rails we already have.

export default function SafetyPage() {
  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <Link href="/" className={styles.wordmark}>
          <span className={styles.wordmarkMark}>◖</span>
          Konnly
        </Link>
      </header>

      <article className={styles.article}>
        <p className={styles.eyebrow}>Safety & community</p>
        <h1 className={styles.title}>Built around a shared table — and around safety.</h1>
        <p className={styles.lede}>
          Konnly is a marketplace for shared activities in public venues. Every safeguard here is
          enforced by the product, not by good intentions.
        </p>

        <section className={styles.section}>
          <h2 className={styles.h2}>Public venues only</h2>
          <p>
            Coffee shops, restaurants, bars. The seeker always picks the venue and the companion
            confirms; no private settings, no exceptions. The venue is captured on the booking and
            shown to both parties before the meeting.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>Verified companions only</h2>
          <p>
            Companions submit identity verification before they can be discovered or booked.
            Unverified profiles never appear in search and cannot receive requests.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>In-app messaging until booked</h2>
          <p>
            Chat unlocks only after a request is accepted, and stays inside Konnly. Contact details,
            payment apps, and outside platforms stay off the conversation until both sides choose to
            share them.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>Held fee, never card data</h2>
          <p>
            The companionship fee is charged at booking and held in escrow. It only releases to your
            companion after the activity is marked complete. If you cancel, the fee is refunded.
            Card data goes directly to Stripe — Konnly&apos;s servers never see it.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>Two-way reviews</h2>
          <p>
            After every completed activity, both the seeker and the companion can review each other.
            Reviews are only allowed for completed bookings, keeping the rating signal honest.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.h2}>What&apos;s coming next</h2>
          <p>
            Report, block, and &quot;share my meal details with a friend&quot; are landing in our
            next phase. If you ever feel unsafe during an activity, leave the venue and reach out at{' '}
            <a href="mailto:hello@konnly.co">hello@konnly.co</a>.
          </p>
        </section>

        <div className={styles.cta}>
          <Link href="/" className={styles.ctaLink}>
            ‹ Back to Konnly
          </Link>
        </div>
      </article>
    </main>
  );
}
