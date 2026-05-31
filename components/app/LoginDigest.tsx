'use client';

// Offline "you missed this" prompt.
//
// The realtime notifiers (ChatNotifications / RequestNotifications) only
// fire while you're online with a page open. Anything that arrived while
// you were signed out is invisible until you go digging. This component
// closes that gap: on first load of a session it asks
// /api/notifications/summary "what's waiting for me?" and, if there are
// unread messages or pending requests, shows a single prominent prompt
// with a jump-in action.
//
// Shows at most once per browser session (sessionStorage) so it greets
// you on login but doesn't nag on every client navigation. Live arrivals
// after that are handled by the realtime toasts.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './LoginDigest.module.css';

const SHOWN_KEY = 'konnly-digest-shown-v1';

interface Summary {
  unreadMessages: number;
  unreadThreads: number;
  pendingRequests: number;
  latestMessage: { name: string; preview: string; bookingId: string } | null;
  latestRequest: { name: string; activity: string } | null;
}

export function LoginDigest() {
  const router = useRouter();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Once per session only.
    try {
      if (window.sessionStorage.getItem(SHOWN_KEY) === '1') return;
    } catch {
      // sessionStorage unavailable — still safe to show once per mount.
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/notifications/summary', {
          headers: { Accept: 'application/json' },
          cache: 'no-store',
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as Summary;
        if (cancelled) return;
        if (data.unreadMessages > 0 || data.pendingRequests > 0) {
          setSummary(data);
          setVisible(true);
          try {
            window.sessionStorage.setItem(SHOWN_KEY, '1');
          } catch {
            // ignored
          }
        }
      } catch {
        // Digest is best-effort; never surface its own failure.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!visible || !summary) return null;

  const { unreadMessages, pendingRequests, latestMessage, latestRequest } = summary;

  // Headline: name the most recent thing, fall back to counts.
  let title: string;
  if (latestMessage && unreadMessages > 0 && pendingRequests === 0) {
    title =
      unreadMessages === 1
        ? `${latestMessage.name} sent you a message`
        : `${latestMessage.name} and others sent you ${unreadMessages} messages`;
  } else if (latestRequest && pendingRequests > 0 && unreadMessages === 0) {
    title =
      pendingRequests === 1
        ? `${latestRequest.name} invited you to ${latestRequest.activity}`
        : `${pendingRequests} new activity requests are waiting`;
  } else {
    const bits: string[] = [];
    if (unreadMessages > 0)
      bits.push(`${unreadMessages} unread message${unreadMessages === 1 ? '' : 's'}`);
    if (pendingRequests > 0)
      bits.push(`${pendingRequests} new request${pendingRequests === 1 ? '' : 's'}`);
    title = `You have ${bits.join(' and ')}`;
  }

  const subtitle =
    latestMessage && unreadMessages > 0 && pendingRequests === 0
      ? latestMessage.preview
      : 'Picked up while you were away.';

  function go(href: string) {
    setVisible(false);
    router.push(href);
  }

  return (
    <div className={styles.wrap} role="status" aria-live="polite">
      <div className={styles.card}>
        <button
          type="button"
          className={styles.close}
          onClick={() => setVisible(false)}
          aria-label="Dismiss"
        >
          ✕
        </button>
        <div className={styles.head}>
          <span className={styles.emoji} aria-hidden>
            👋
          </span>
          <div className={styles.text}>
            <strong className={styles.title}>{title}</strong>
            <span className={styles.subtitle}>{subtitle}</span>
          </div>
        </div>
        <div className={styles.actions}>
          {unreadMessages > 0 ? (
            <button
              type="button"
              className={styles.primary}
              onClick={() => go(latestMessage ? `/chat/${latestMessage.bookingId}` : '/chat')}
            >
              Open {unreadMessages > 1 || !latestMessage ? 'chats' : 'chat'}
            </button>
          ) : null}
          {pendingRequests > 0 ? (
            <button
              type="button"
              className={unreadMessages > 0 ? styles.secondary : styles.primary}
              onClick={() => go('/requests')}
            >
              View requests
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
