'use client';

// One-time welcome banner shown on the first signed-in page load. Sets
// expectations honestly (early beta, things may break, here's how to
// tell us) and points at the in-app reporter. Dismissed forever via a
// localStorage flag — never nags after the first acknowledgement.

import { useEffect, useState } from 'react';
import styles from './BetaWelcomeBanner.module.css';

const DISMISS_KEY = 'konnly-beta-welcome-dismissed-v1';

export function BetaWelcomeBanner() {
  // Start hidden; reveal only after we confirm it hasn't been dismissed.
  // Avoids a flash of the banner on every navigation for returning users.
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(DISMISS_KEY) !== '1') setShow(true);
    } catch {
      // private mode etc. — fail closed (don't show) to avoid nagging.
    }
  }, []);

  function dismiss() {
    setShow(false);
    try {
      window.localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // ignored
    }
  }

  if (!show) return null;

  return (
    <div className={styles.wrap} role="status">
      <div className={styles.inner}>
        <span className={styles.emoji} aria-hidden>
          👋
        </span>
        <div className={styles.body}>
          <strong className={styles.title}>Welcome — you’re early.</strong>
          <span className={styles.text}>
            Konnly is in private beta, so a few things may be rough. If something breaks or feels
            off, tell us with the <strong>💬 Report an issue</strong> link in your profile menu — it
            genuinely shapes what we build next.
          </span>
        </div>
        <button type="button" className={styles.close} onClick={dismiss} aria-label="Dismiss">
          Got it
        </button>
      </div>
    </div>
  );
}
