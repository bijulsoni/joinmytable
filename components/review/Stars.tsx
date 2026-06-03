// Read-only star rating display. No interactivity, so it stays a plain
// (server-renderable) component — usable in the reviews list on a
// companion profile as well as inside the client ReviewSection.

import styles from './review.module.css';

export function Stars({ value, className }: { value: number; className?: string }) {
  const rounded = Math.round(value);
  return (
    <span
      className={[styles.stars, className].filter(Boolean).join(' ')}
      role="img"
      aria-label={`${value} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= rounded ? styles.starOn : styles.starOff} aria-hidden>
          ★
        </span>
      ))}
    </span>
  );
}
