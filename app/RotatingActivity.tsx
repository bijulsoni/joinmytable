'use client';

import { useEffect, useState } from 'react';
import type { ActivityType } from '@/lib/types';
import styles from './page.module.css';

const VERBS: Record<ActivityType, string> = {
  coffee: 'sip coffee',
  lunch: 'lunch',
  happy_hour: 'unwind',
  dinner: 'dine',
};

const ORDER: ActivityType[] = ['lunch', 'coffee', 'happy_hour', 'dinner'];
const INTERVAL_MS = 2600;

// Animated headline that cycles through the four activities. The
// `data-activity` attribute on the section drives the accent color via
// CSS custom props (see globals.css activity tokens).
export function RotatingActivity() {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setIdx((i) => (i + 1) % ORDER.length);
    }, INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  const activity = ORDER[idx]!;

  return (
    <div data-activity={activity} style={{ display: 'contents' }}>
      <p className={styles.eyebrow}>
        <span className={styles.eyebrowDot} />
        Coffee · Lunch · Happy hour · Dinner
      </p>
      <h1 className={styles.headline}>
        Never{' '}
        <span key={activity} className={styles.headlineSpan}>
          {VERBS[activity]}
        </span>{' '}
        alone again.
      </h1>
    </div>
  );
}
