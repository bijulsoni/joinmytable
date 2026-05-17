// Generic empty-state block for lists. Pass an SVG (or any node) as `icon`
// and an optional `action` slot for the obvious next step.

import type { ReactNode } from 'react';
import styles from './EmptyState.module.css';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}

const DEFAULT_ICON = (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M4 7h16" />
    <path d="M4 12h10" />
    <path d="M4 17h16" />
  </svg>
);

export function EmptyState({ icon, title, children, action }: EmptyStateProps) {
  return (
    <div className={styles.wrap} role="status">
      <span className={styles.iconWrap}>{icon ?? DEFAULT_ICON}</span>
      <h2 className={styles.title}>{title}</h2>
      {children ? <p className={styles.body}>{children}</p> : null}
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
