'use client';

// Global request notifier.
//
// Mounted alongside ChatNotifications in AppShell. Listens for:
//
//   - INSERT on meal_requests where the caller is the companion
//     (someone just requested an activity with them) → toast.
//   - UPDATE on meal_requests where the caller is the seeker and the
//     status flipped to accepted/declined → toast (companion responded).
//
// Realtime RLS gates which events the broker delivers. The caller_role
// here is derived from the row payload (seeker_id vs companion_id).
//
// Toasts auto-dismiss after ~7s, stack 3 deep, tap to navigate to the
// right surface (/requests for new inbound, /bookings or /chat for
// accepted, /requests for declined).

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import styles from './ChatNotifications.module.css';

interface MealRequestRow {
  id: string;
  seeker_id: string;
  companion_id: string;
  activity_type: 'coffee' | 'lunch' | 'dinner' | 'happy_hour';
  venue_name: string | null;
  proposed_time: string;
  status: 'requested' | 'accepted' | 'declined';
}

interface Toast {
  key: string;
  bookingHref: string;
  icon: string;
  title: string;
  preview: string;
}

const ACTIVITY_LABEL: Record<MealRequestRow['activity_type'], string> = {
  coffee: 'coffee',
  lunch: 'lunch',
  dinner: 'dinner',
  happy_hour: 'happy hour',
};

const TOAST_TTL_MS = 7500;
const nameCache = new Map<string, string>();
const bookingCache = new Map<string, string>(); // request_id -> booking_id

async function lookupName(userId: string): Promise<string> {
  if (nameCache.has(userId)) return nameCache.get(userId)!;
  // We don't have a public name-lookup endpoint, so go through the
  // /api/requests list — its rows include counterpart_name. Falls back
  // to a generic label if anything goes sideways.
  try {
    const res = await fetch('/api/requests', {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) return 'Someone';
    const body = (await res.json()) as {
      requests?: Array<{
        id: string;
        seeker_id: string;
        companion_id: string;
        counterpart_name: string | null;
        booking_id: string | null;
      }>;
    };
    for (const r of body.requests ?? []) {
      const other =
        r.seeker_id === userId ? r.seeker_id : r.companion_id === userId ? r.companion_id : null;
      const name = r.counterpart_name?.trim() ?? '';
      if (name) {
        // r.counterpart_name is "the other side" relative to the caller.
        // Cache it under the user id that is NOT the caller.
        const otherId = r.seeker_id === other ? r.companion_id : r.seeker_id;
        nameCache.set(otherId, name);
      }
      if (r.booking_id) bookingCache.set(r.id, r.booking_id);
    }
    return nameCache.get(userId) ?? 'Someone';
  } catch {
    return 'Someone';
  }
}

interface Props {
  userId: string;
}

export function RequestNotifications({ userId }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  const dismiss = useCallback((key: string) => {
    setToasts((prev) => prev.filter((t) => t.key !== key));
  }, []);

  const open = useCallback(
    (toast: Toast) => {
      dismiss(toast.key);
      router.push(toast.bookingHref);
    },
    [dismiss, router],
  );

  const push = useCallback((toast: Toast) => {
    setToasts((prev) => [...prev.slice(-2), toast]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.key !== toast.key));
    }, TOAST_TTL_MS);
  }, []);

  useEffect(() => {
    let mounted = true;
    let channel: ReturnType<ReturnType<typeof createSupabaseBrowserClient>['channel']> | null =
      null;
    const supabase = createSupabaseBrowserClient();
    let authSub: { data: { subscription: { unsubscribe: () => void } } } | null = null;

    (async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token) supabase.realtime.setAuth(token);

      authSub = supabase.auth.onAuthStateChange((_evt, session) => {
        if (session?.access_token) supabase.realtime.setAuth(session.access_token);
      });

      if (!mounted) return;
      // supabase-js typings narrow the channel after the first .on('postgres_changes'),
      // which then rejects subsequent .on('postgres_changes') calls in the
      // chain. Cast each .on to a loose return so we can chain two events.
      const ch = supabase.channel(`global-requests:${userId}`) as any;
      channel = ch
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'meal_requests' },
          async (payload: { new: MealRequestRow }) => {
            if (!mounted) return;
            const r = payload.new;
            // Companion's view — someone just requested with them.
            if (r.companion_id !== userId) return;
            if (pathnameRef.current === '/requests') {
              // The hub is open — it'll re-render via its own subscription;
              // still show a toast so the user sees what changed.
            }
            const seekerName = await lookupName(r.seeker_id);
            push({
              key: `new-${r.id}`,
              bookingHref: '/requests',
              icon: '✨',
              title: `${seekerName} requested ${ACTIVITY_LABEL[r.activity_type]}`,
              preview: r.venue_name
                ? `${r.venue_name} · ${new Date(r.proposed_time).toLocaleString(undefined, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}`
                : 'Open requests to accept or decline.',
            });
          },
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'meal_requests' },
          async (payload: { new: MealRequestRow; old: MealRequestRow }) => {
            if (!mounted) return;
            const r = payload.new;
            // Seeker's view — their request just got accepted/declined.
            if (r.seeker_id !== userId) return;
            if (payload.old?.status === r.status) return;
            const companionName = await lookupName(r.companion_id);
            if (r.status === 'accepted') {
              const bookingId = bookingCache.get(r.id);
              push({
                key: `acc-${r.id}`,
                bookingHref: bookingId ? `/chat/${bookingId}` : '/requests',
                icon: '✓',
                title: `${companionName} accepted your ${ACTIVITY_LABEL[r.activity_type]}`,
                preview: 'Open the chat to nail down details.',
              });
            } else if (r.status === 'declined') {
              push({
                key: `dec-${r.id}`,
                bookingHref: '/requests',
                icon: '✕',
                title: `${companionName} declined your ${ACTIVITY_LABEL[r.activity_type]}`,
                preview: 'Try another companion or a different time.',
              });
            }
          },
        )
        .subscribe();
    })();

    return () => {
      mounted = false;
      if (channel) void supabase.removeChannel(channel);
      authSub?.data.subscription.unsubscribe();
    };
  }, [userId, push]);

  if (toasts.length === 0) return null;

  return (
    <div className={styles.dock} aria-live="polite">
      {toasts.map((t) => (
        <button
          key={t.key}
          type="button"
          className={styles.toast}
          onClick={() => open(t)}
          aria-label={t.title}
        >
          <span className={styles.toastBadge} aria-hidden>
            {t.icon}
          </span>
          <span className={styles.toastBody}>
            <span className={styles.toastName}>{t.title}</span>
            <span className={styles.toastPreview}>{t.preview}</span>
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
