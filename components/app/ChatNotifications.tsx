'use client';

// Global new-message notifier.
//
// Mounted inside AppShell so every signed-in page has a live subscription
// to incoming messages (across ALL the user's bookings, not just the
// chat thread they happen to be viewing). When a message arrives:
//
//   - Ignored if the user is the sender (their own message).
//   - Ignored if the user is currently on /chat/[bookingId] for that
//     booking — the open thread shows it inline.
//   - Ignored if the dock has the chat OPEN and NOT minimized — the
//     dock pane shows it inline; toasting would overlap.
//   - Minimized dock chats still toast, so the user knows there's a
//     new message in the pill at the right edge.
//   - Otherwise a toast slides in from bottom-right: counterpart name +
//     message preview + Open button. Auto-dismisses after 7s; click
//     anywhere on the toast to jump into the chat.

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { useChatDock } from '@/lib/chat/dock-context';
import styles from './ChatNotifications.module.css';

interface MessageRow {
  id: string;
  booking_id: string;
  sender_id: string | null;
  body: string;
  is_system_message: boolean;
  sent_at: string;
}

interface Toast {
  key: string;
  bookingId: string;
  body: string;
  counterpartName: string;
  ts: number;
}

interface Props {
  /** Auth user id of the current viewer; used to ignore self-sent messages. */
  userId: string;
}

const TOAST_TTL_MS = 7000;
// Cache booking → counterpart-name so we don't re-fetch per message.
const cache = new Map<string, string>();

async function resolveCounterpartName(bookingId: string): Promise<string> {
  if (cache.has(bookingId)) return cache.get(bookingId)!;
  try {
    const res = await fetch(`/api/bookings/${bookingId}`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) return 'Someone';
    const body = (await res.json()) as { booking?: { counterpart_name?: string | null } };
    const name = body.booking?.counterpart_name?.trim() || 'Someone';
    cache.set(bookingId, name);
    return name;
  } catch {
    return 'Someone';
  }
}

export function ChatNotifications({ userId }: Props) {
  const { openChat, openChats } = useChatDock();
  const pathname = usePathname();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  // Track the live dock state via a ref so the subscription callback —
  // which closes over the initial render's state — sees current values.
  const openChatsRef = useRef(openChats);
  openChatsRef.current = openChats;

  const dismiss = useCallback((key: string) => {
    setToasts((prev) => prev.filter((t) => t.key !== key));
  }, []);

  const open = useCallback(
    (toast: Toast) => {
      dismiss(toast.key);
      openChat(toast.bookingId);
    },
    [dismiss, openChat],
  );

  useEffect(() => {
    let mounted = true;
    let channel: ReturnType<ReturnType<typeof createSupabaseBrowserClient>['channel']> | null =
      null;
    const supabase = createSupabaseBrowserClient();
    let authSub: { data: { subscription: { unsubscribe: () => void } } } | null = null;

    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (token) supabase.realtime.setAuth(token);

      authSub = supabase.auth.onAuthStateChange((_evt, session) => {
        if (session?.access_token) supabase.realtime.setAuth(session.access_token);
      });

      if (!mounted) return;
      channel = supabase
        .channel(`global-messages:${userId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
          },
          async (payload: { new: MessageRow }) => {
            if (!mounted) return;
            const m = payload.new;
            if (m.is_system_message) return;
            if (m.sender_id === userId) return;
            // If the user is currently viewing this thread (full-page or
            // an open + non-minimized dock window), the in-pane
            // subscription renders it — don't double up with a toast.
            if (pathnameRef.current === `/chat/${m.booking_id}`) return;
            const docked = openChatsRef.current.find((c) => c.bookingId === m.booking_id);
            if (docked && !docked.minimized) return;

            const counterpartName = await resolveCounterpartName(m.booking_id);
            const toast: Toast = {
              key: m.id,
              bookingId: m.booking_id,
              body: m.body,
              counterpartName,
              ts: Date.now(),
            };
            setToasts((prev) => [...prev.slice(-2), toast]);
            window.setTimeout(() => {
              if (!mounted) return;
              setToasts((prev) => prev.filter((t) => t.key !== toast.key));
            }, TOAST_TTL_MS);
          },
        )
        .subscribe();
    })();

    return () => {
      mounted = false;
      if (channel) void supabase.removeChannel(channel);
      authSub?.data.subscription.unsubscribe();
    };
  }, [userId]);

  if (toasts.length === 0) return null;

  return (
    <div className={styles.dock} aria-live="polite">
      {toasts.map((t) => (
        <button
          key={t.key}
          type="button"
          className={styles.toast}
          onClick={() => open(t)}
          aria-label={`New message from ${t.counterpartName}. Open chat.`}
        >
          <span className={styles.toastBadge} aria-hidden>
            💬
          </span>
          <span className={styles.toastBody}>
            <span className={styles.toastName}>{t.counterpartName}</span>
            <span className={styles.toastPreview}>{t.body}</span>
          </span>
          <span
            role="button"
            className={styles.toastDismiss}
            onClick={(e) => {
              e.stopPropagation();
              dismiss(t.key);
            }}
            aria-label="Dismiss"
          >
            ✕
          </span>
        </button>
      ))}
    </div>
  );
}
