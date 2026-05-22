import type { ReactNode } from 'react';
import Link from 'next/link';
import styles from './styles.module.css';

// Shared shell for every (auth) screen — sign-up, login, forgot, reset,
// verify, mode, etc. Keeps the brand bar + warm backdrop + centered card
// consistent so the whole auth flow feels like one place.

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <header className={styles.shellTopbar}>
        <Link href="/" className={styles.wordmark}>
          <span className={styles.wordmarkMark}>◖</span>
          Konnly
        </Link>
      </header>
      <main className={styles.shellMain}>
        <div className={styles.shellInner}>{children}</div>
      </main>
      <footer className={styles.shellFooter}>Public venues only. Verified companions only.</footer>
    </div>
  );
}
