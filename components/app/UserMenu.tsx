'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ReportIssueDialog } from './ReportIssueDialog';
import styles from './UserMenu.module.css';

interface UserMenuProps {
  name: string;
  email: string;
  initials: string;
  /** Hero photo URL (companion_profiles.photo_urls[0]). When set, the
   *  avatar pill renders the photo; otherwise it falls back to initials. */
  photoUrl: string | null;
}

// User menu — avatar pill in the top-right that opens a small popover
// with "View profile / Verification / Sign out". The signout is a form
// POST so it works without JS.
export function UserMenu({ name, email, initials, photoUrl }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className={styles.trigger}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt="" className={styles.avatarPhoto} />
        ) : (
          <span className={styles.avatar} aria-hidden>
            {initials}
          </span>
        )}
        <span className={styles.chev} aria-hidden>
          ▾
        </span>
      </button>
      {open ? (
        <div className={styles.popover} role="menu">
          <div className={styles.identity}>
            <div className={styles.identityName}>{name}</div>
            <div className={styles.identityEmail}>{email}</div>
          </div>
          <Link
            href="/profile"
            className={styles.item}
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <span aria-hidden>👤</span> View profile
          </Link>
          <Link
            href="/verify"
            className={styles.item}
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <span aria-hidden>✓</span> Identity &amp; verification
          </Link>
          <button
            type="button"
            className={styles.item}
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setReportOpen(true);
            }}
          >
            <span aria-hidden>💬</span> Report an issue
          </button>
          <div className={styles.divider} aria-hidden />
          <form action="/logout" method="post" className={styles.signoutForm}>
            <button type="submit" className={`${styles.item} ${styles.signout}`} role="menuitem">
              <span aria-hidden>↪</span> Sign out
            </button>
          </form>
        </div>
      ) : null}
      <ReportIssueDialog open={reportOpen} onClose={() => setReportOpen(false)} />
    </div>
  );
}
