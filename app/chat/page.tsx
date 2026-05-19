import type { Metadata } from 'next';
import Link from 'next/link';
import { AppShell } from '@/components/app';
import { Avatar, Badge, Button, EmptyState } from '@/components/ui';
import { requireSessionUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ACTIVITY_TYPE_META, type ActivityType, type BookingStatus } from '@/lib/types';
import styles from './styles.module.css';

export const metadata: Metadata = {
  title: 'Messages',
};

// /chat — message inbox. Lists every booking the caller participates in
// alongside its latest message preview. Per CLAUDE.md core rule #8, chat
// only unlocks after a booking exists; bookings live in 1:1 with chat
// threads, so "all my chats" === "all my bookings sorted by recent
// activity."

interface BookingListItem {
  id: string;
  activity_type: ActivityType;
  venue_name: string;
  scheduled_time: string;
  status: BookingStatus;
  counterpart_name: string;
  last_message_body: string | null;
  last_message_sent_at: string | null;
  last_message_was_system: boolean;
}

function formatRelative(iso: string | null): string {
  if (!iso) return '';
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return '';
  const diffMin = Math.round((Date.now() - ts) / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffMin < 60 * 24) return `${Math.round(diffMin / 60)}h ago`;
  const days = Math.round(diffMin / (60 * 24));
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function previewBody(item: BookingListItem): string {
  if (!item.last_message_body) return 'No messages yet';
  const prefix = item.last_message_was_system ? '· ' : '';
  return prefix + item.last_message_body.replace(/\s+/g, ' ').slice(0, 120);
}

interface BookingRow {
  id: string;
  activity_type: ActivityType;
  venue_name: string;
  scheduled_time: string;
  status: BookingStatus;
  meal_requests: {
    seeker_id: string;
    companion_id: string;
    seeker: { name: string | null } | null;
    companion: { name: string | null } | null;
  } | null;
}

interface MessageRow {
  booking_id: string;
  body: string;
  sent_at: string;
  is_system_message: boolean;
}

export default async function ChatIndexPage() {
  const session = await requireSessionUser('/login?next=/chat');
  const supabase = await createSupabaseServerClient();

  const { data: bookingsRaw, error: bookErr } = await supabase
    .from('bookings')
    .select(
      `id, activity_type, venue_name, scheduled_time, status,
       meal_requests!bookings_request_id_fkey(
         seeker_id,
         companion_id,
         seeker:users!meal_requests_seeker_id_fkey(name),
         companion:users!meal_requests_companion_id_fkey(name)
       )`,
    )
    .order('scheduled_time', { ascending: false })
    .limit(50);

  const bookings = (bookingsRaw ?? []) as unknown as BookingRow[];

  // Pull the latest message per booking in a single query, then group on
  // the client. Using `order DESC limit N*2` keeps the trip cheap;
  // proper "lateral join LIMIT 1" lives in a Phase-5 SQL view.
  const ids = bookings.map((b) => b.id);
  const latestByBooking = new Map<string, MessageRow>();
  if (ids.length > 0) {
    const { data: msgsRaw } = await supabase
      .from('messages')
      .select('booking_id, body, sent_at, is_system_message')
      .in('booking_id', ids)
      .order('sent_at', { ascending: false })
      .limit(ids.length * 6);
    const msgs = (msgsRaw ?? []) as MessageRow[];
    for (const m of msgs) {
      if (!latestByBooking.has(m.booking_id)) {
        latestByBooking.set(m.booking_id, m);
      }
    }
  }

  const items: BookingListItem[] = bookings
    .filter((b) => b.meal_requests)
    .map((b) => {
      const seekerId = b.meal_requests!.seeker_id;
      const counterpartName =
        seekerId === session.id
          ? (b.meal_requests!.companion?.name ?? 'A companion')
          : (b.meal_requests!.seeker?.name ?? 'A seeker');
      const last = latestByBooking.get(b.id);
      return {
        id: b.id,
        activity_type: b.activity_type,
        venue_name: b.venue_name,
        scheduled_time: b.scheduled_time,
        status: b.status,
        counterpart_name: counterpartName,
        last_message_body: last?.body ?? null,
        last_message_sent_at: last?.sent_at ?? null,
        last_message_was_system: last?.is_system_message ?? false,
      };
    });

  // Sort by most-recent message (fallback to scheduled_time).
  items.sort((a, b) => {
    const av = a.last_message_sent_at ?? a.scheduled_time;
    const bv = b.last_message_sent_at ?? b.scheduled_time;
    return new Date(bv).getTime() - new Date(av).getTime();
  });

  return (
    <AppShell loginRedirectTo="/chat">
      <main className={styles.inboxShell}>
        <header className={styles.inboxHeader}>
          <h1 className={styles.inboxTitle}>Messages</h1>
          <p className={styles.inboxLede}>
            Every booking has its own thread. Newest activity first.
          </p>
        </header>

        {bookErr ? (
          <div className={styles.errorBanner}>
            Couldn&apos;t load your conversations. {bookErr.message}
          </div>
        ) : null}

        {items.length === 0 ? (
          <EmptyState
            title="No conversations yet"
            action={
              <Button as={Link} href="/discover" variant="primary">
                Find a companion
              </Button>
            }
          >
            Send a request and once it&apos;s accepted, the chat opens up here.
          </EmptyState>
        ) : (
          <ul className={styles.inboxList}>
            {items.map((it) => (
              <li key={it.id} className={styles.inboxItem}>
                <Link href={`/chat/${it.id}`} className={styles.inboxLink}>
                  <Avatar name={it.counterpart_name} size={48} />
                  <div className={styles.inboxBody}>
                    <div className={styles.inboxTopRow}>
                      <span className={styles.inboxName}>{it.counterpart_name}</span>
                      <span className={styles.inboxTime}>
                        {formatRelative(it.last_message_sent_at ?? it.scheduled_time)}
                      </span>
                    </div>
                    <p className={styles.inboxPreview}>{previewBody(it)}</p>
                    <div className={styles.inboxFooter}>
                      <Badge activity={it.activity_type}>
                        {ACTIVITY_TYPE_META[it.activity_type].label}
                      </Badge>
                      <span
                        className={`${styles.statusPill} ${styles[`status_${it.status}`] ?? ''}`}
                      >
                        {it.status}
                      </span>
                      <span className={styles.inboxVenue}>· {it.venue_name}</span>
                    </div>
                  </div>
                  <span className={styles.inboxChevron} aria-hidden>
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </AppShell>
  );
}
