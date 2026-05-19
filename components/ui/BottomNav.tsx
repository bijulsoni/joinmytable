'use client';

// Mobile-first bottom navigation. Marked `'use client'` so we can read the
// active route with `usePathname()` and apply the highlighted style without
// a server round-trip. Hidden at desktop widths via the CSS module; pair
// with <BottomNavSpacer /> in any layout that includes <BottomNav /> so
// page content is not occluded by the fixed bar on mobile.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import styles from './BottomNav.module.css';

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  /** Optional list of route prefixes that count as "this tab". */
  matchPrefixes?: string[];
}

function isActive(pathname: string | null, item: NavItem): boolean {
  if (!pathname) return false;
  if (pathname === item.href) return true;
  const prefixes = item.matchPrefixes ?? [item.href];
  return prefixes.some((p) => p !== '/' && pathname.startsWith(p));
}

const ICON_PROPS = {
  className: styles.icon,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  viewBox: '0 0 24 24',
  'aria-hidden': true,
};

const ITEMS: NavItem[] = [
  {
    href: '/discover',
    label: 'Discover',
    matchPrefixes: ['/discover', '/companions'],
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M3 11.5 12 4l9 7.5" />
        <path d="M5 10v9h14v-9" />
      </svg>
    ),
  },
  {
    href: '/plans',
    label: 'Plans',
    matchPrefixes: ['/plans', '/bookings', '/requests'],
    icon: (
      <svg {...ICON_PROPS}>
        <rect x="4" y="5" width="16" height="16" rx="2" />
        <path d="M4 10h16" />
        <path d="M9 3v4" />
        <path d="M15 3v4" />
      </svg>
    ),
  },
  {
    href: '/chat',
    label: 'Messages',
    matchPrefixes: ['/chat'],
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.5A8 8 0 1 1 21 12z" />
      </svg>
    ),
  },
  {
    href: '/profile',
    label: 'Profile',
    matchPrefixes: ['/profile', '/verify', '/mode'],
    icon: (
      <svg {...ICON_PROPS}>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c.7-3.9 4-7 8-7s7.3 3.1 8 7" />
      </svg>
    ),
  },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className={styles.nav} aria-label="Primary">
      {ITEMS.map((item) => {
        const active = isActive(pathname, item);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={[styles.item, active ? styles.active : ''].filter(Boolean).join(' ')}
            aria-current={active ? 'page' : undefined}
          >
            {item.icon}
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** Reserve the space the fixed bottom nav would occupy on mobile. */
export function BottomNavSpacer() {
  return <div className={styles.spacer} aria-hidden />;
}
