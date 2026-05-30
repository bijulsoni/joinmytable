import styles from './BetaBadge.module.css';

// Small "BETA" pill shown next to the wordmark across the app. Always
// visible — a standing, honest signal that Konnly is an early product
// and things may be rough. Pairs with the one-time BetaWelcomeBanner
// that explains it in more detail on first run.
export function BetaBadge({ title = 'Konnly is in early private beta' }: { title?: string }) {
  return (
    <span className={styles.badge} title={title}>
      Beta
    </span>
  );
}
