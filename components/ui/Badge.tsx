// Activity-type badge. Setting `data-activity="lunch"` on the badge (or
// any ancestor) drives the color through the `--activity` /
// `--activity-soft` custom properties defined in globals.css. Passing
// `activity` directly is a convenience that does both at once.

import type { ReactNode } from 'react';
import { ACTIVITY_TYPE_META, type ActivityType } from '@/lib/types';
import styles from './Badge.module.css';

type BadgeVariant = 'solid' | 'soft' | 'outline';

interface BadgeProps {
  activity?: ActivityType;
  variant?: BadgeVariant;
  /** When true, omits the label and renders only a dot — useful inside dense lists. */
  dot?: boolean;
  children?: ReactNode;
  className?: string;
}

export function Badge({
  activity,
  variant = 'soft',
  dot = false,
  children,
  className,
}: BadgeProps) {
  const label = children ?? (activity ? ACTIVITY_TYPE_META[activity].label : null);
  const classes = [styles.badge, styles[variant], className ?? ''].filter(Boolean).join(' ');
  return (
    <span className={classes} data-activity={activity}>
      {dot ? <span className={styles.dot} aria-hidden /> : null}
      {label}
    </span>
  );
}
