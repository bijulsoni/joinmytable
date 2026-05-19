'use client';

// The floating chat dock. Renders the open chats as a horizontal stack
// at the bottom-right of the viewport. Minimized chats collapse into a
// pill bar at the right edge.

import { useEffect, useState } from 'react';
import { useChatDock } from '@/lib/chat/dock-context';
import { Avatar } from '@/components/ui';
import { ChatPane } from './ChatPane';
import styles from './ChatDock.module.css';

interface CompactBooking {
  counterpart_name: string;
}

// Lightweight name-only fetch used to label minimized pills. Cached.
const nameCache = new Map<string, string>();

function useCounterpartName(bookingId: string): string {
  const [name, setName] = useState<string>(nameCache.get(bookingId) ?? 'Chat');
  useEffect(() => {
    if (nameCache.has(bookingId)) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/bookings/${bookingId}`, {
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) return;
        const body = (await res.json()) as {
          booking?: { counterpart_name: string | null };
        };
        if (cancelled) return;
        const n = body.booking?.counterpart_name?.trim() || 'Chat';
        nameCache.set(bookingId, n);
        setName(n);
      } catch {
        // ignore — keep default label
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bookingId]);
  return name;
}

function MinimizedPill({
  bookingId,
  onClick,
  onClose,
}: {
  bookingId: string;
  onClick: () => void;
  onClose: () => void;
}) {
  const name = useCounterpartName(bookingId);
  return (
    <div className={styles.pill}>
      <button
        type="button"
        className={styles.pillBody}
        onClick={onClick}
        aria-label={`Open chat with ${name}`}
        title={name}
      >
        <Avatar name={name} size={32} />
        <span className={styles.pillName}>{name}</span>
      </button>
      <button type="button" className={styles.pillClose} onClick={onClose} aria-label="Close">
        ✕
      </button>
    </div>
  );
}

export function ChatDock() {
  const { openChats, closeChat, toggleMinimize } = useChatDock();

  if (openChats.length === 0) return null;

  const minimized = openChats.filter((c) => c.minimized);
  const maximized = openChats.filter((c) => !c.minimized);

  return (
    <div className={styles.dock} aria-label="Open chats">
      <div className={styles.windows}>
        {maximized.map((c) => (
          <ChatPane
            key={c.bookingId}
            bookingId={c.bookingId}
            onMinimize={() => toggleMinimize(c.bookingId)}
            onClose={() => closeChat(c.bookingId)}
          />
        ))}
      </div>
      {minimized.length > 0 ? (
        <div className={styles.pills}>
          {minimized.map((c) => (
            <MinimizedPill
              key={c.bookingId}
              bookingId={c.bookingId}
              onClick={() => toggleMinimize(c.bookingId)}
              onClose={() => closeChat(c.bookingId)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

// Tiny click-handler hook for openers — keeps caller code terse.
// `useOpenChat` returns a function that opens a chat in the dock.
export { useChatDock };

// Re-export for places that just want the type without importing the
// context module name twice.
export type { CompactBooking };
