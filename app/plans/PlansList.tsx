'use client';

// /bookings — list view.
//
// "Upcoming" shows:
//   - Pending inbound requests (companion view) at the top, with
//     Accept / Decline buttons inline. This is the user's first stop
//     after a seeker requests an activity, so they can act without
//     bouncing to /requests.
//   - Outbound requests waiting on the companion (seeker view) so the
//     seeker can see what they're waiting on.
//   - All bookings whose status is `confirmed` and scheduled_time is
//     in the future.
//
// "Past" shows bookings that are `completed` or `cancelled`, plus any
// declined requests for context.
//
// Live updates via Supabase Realtime: incoming requests + booking state
// changes refresh the list automatically.

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, EmptyState } from '@/components/ui';
import { StatusMessage } from '@/components/StatusMessage';
import { CounterpartAvatar } from '@/components/app/CounterpartAvatar';
import { useChatDock } from '@/lib/chat/dock-context';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import {
  ACTIVITY_TYPE_META,
  type ActivityType,
  type BookingStatus,
  type RequestStatus,
} from '@/lib/types';
import styles from './styles.module.css';

interface BookingListItem {
  id: string;
  activity_type: ActivityType;
  venue_name: string;
  scheduled_time: string;
  status: BookingStatus;
  counterpart_name: string | null;
  counterpart_photo_urls?: string[];
}

interface RequestListItem {
  id: string;
  seeker_id: string;
  companion_id: string;
  activity_type: ActivityType;
  proposed_time: string;
  venue_name: string | null;
  status: RequestStatus;
  counterpart_name: string | null;
  counterpart_photo_urls?: string[];
  message: string | null;
}

type Tab = 'upcoming' | 'past';

function formatScheduled(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function bookingStatusClass(status: BookingStatus): string {
  return (
    {
      confirmed: styles.confirmed ?? '',
      completed: styles.completed ?? '',
      cancelled: styles.cancelled ?? '',
    }[status] ?? ''
  );
}

export function PlansList() {
  const { openChat } = useChatDock();
  const [tab, setTab] = useState<Tab>('upcoming');
  const [bookings, setBookings] = useState<BookingListItem[] | null>(null);
  const [inbound, setInbound] = useState<RequestListItem[]>([]);
  const [outbound, setOutbound] = useState<RequestListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [respondingId, setRespondingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [bRes, rRes] = await Promise.all([
        fetch('/api/bookings', { cache: 'no-store', headers: { Accept: 'application/json' } }),
        fetch('/api/requests', { cache: 'no-store', headers: { Accept: 'application/json' } }),
      ]);
      if (!bRes.ok) {
        const body = (await bRes.json().catch(() => ({}))) as { error?: { message?: string } };
        throw new Error(body.error?.message ?? `Could not load bookings (${bRes.status}).`);
      }
      if (!rRes.ok) {
        const body = (await rRes.json().catch(() => ({}))) as { error?: { message?: string } };
        throw new Error(body.error?.message ?? `Could not load requests (${rRes.status}).`);
      }
      const bBody = (await bRes.json()) as { bookings: BookingListItem[] };
      const rBody = (await rRes.json()) as {
        inbound: RequestListItem[];
        outbound: RequestListItem[];
      };
      setBookings(bBody.bookings ?? []);
      setInbound(rBody.inbound ?? []);
      setOutbound(rBody.outbound ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load bookings.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Live updates: re-fetch when meal_requests or bookings change. RLS
  // already scopes the events to the caller's rows.
  useEffect(() => {
    let mounted = true;
    const supabase = createSupabaseBrowserClient();
    let channel: ReturnType<ReturnType<typeof createSupabaseBrowserClient>['channel']> | null =
      null;
    let authSub: { data: { subscription: { unsubscribe: () => void } } } | null = null;

    (async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token) supabase.realtime.setAuth(token);
      authSub = supabase.auth.onAuthStateChange((_evt, session) => {
        if (session?.access_token) supabase.realtime.setAuth(session.access_token);
      });
      if (!mounted) return;
      const onChange = () => {
        if (mounted) void load();
      };
      const ch = supabase.channel('bookings-list-live') as any;
      channel = ch
        .on('postgres_changes', { event: '*', schema: 'public', table: 'meal_requests' }, onChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, onChange)
        .subscribe();
    })();

    return () => {
      mounted = false;
      if (channel) void supabase.removeChannel(channel);
      authSub?.data.subscription.unsubscribe();
    };
  }, [load]);

  const respond = useCallback(
    async (id: string, status: 'accepted' | 'declined') => {
      setRespondingId(id);
      try {
        const res = await fetch(`/api/requests/${id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ status }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
          throw new Error(body.error?.message ?? `Could not respond (${res.status}).`);
        }
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not respond.');
      } finally {
        setRespondingId(null);
      }
    },
    [load],
  );

  const pendingInbound = useMemo(() => inbound.filter((r) => r.status === 'requested'), [inbound]);
  const pendingOutbound = useMemo(
    () => outbound.filter((r) => r.status === 'requested'),
    [outbound],
  );

  // A booking is "upcoming" while status is `confirmed` — completing or
  // cancelling moves it to past. We deliberately don't drop confirmed
  // bookings whose proposed time has slipped: many users pick a default
  // time, it elapses, and the meeting is still on. The owner closes it
  // explicitly via Mark complete / cancel.
  const upcomingBookings = useMemo(
    () => (bookings ?? []).filter((b) => b.status === 'confirmed'),
    [bookings],
  );
  const pastBookings = useMemo(
    () => (bookings ?? []).filter((b) => b.status === 'completed' || b.status === 'cancelled'),
    [bookings],
  );
  // Declined requests land in Past so there's a record of "I asked and
  // they said no" instead of the row silently disappearing.
  const declinedInbound = useMemo(() => inbound.filter((r) => r.status === 'declined'), [inbound]);
  const declinedOutbound = useMemo(
    () => outbound.filter((r) => r.status === 'declined'),
    [outbound],
  );

  const upcomingEmpty =
    pendingInbound.length === 0 && pendingOutbound.length === 0 && upcomingBookings.length === 0;
  const pastEmpty =
    pastBookings.length === 0 && declinedInbound.length === 0 && declinedOutbound.length === 0;

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <h1 className={styles.title}>Plans</h1>
      </header>

      <div className={styles.tabs} role="tablist" aria-label="Plans timeline">
        {(['upcoming', 'past'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            className={styles.tab}
            onClick={() => setTab(t)}
          >
            {t === 'upcoming' ? 'Upcoming' : 'Past'}
          </button>
        ))}
      </div>

      <section className={styles.list} role="tabpanel">
        {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}

        {bookings === null ? (
          <>
            <div className={styles.skeleton} />
            <div className={styles.skeleton} />
          </>
        ) : tab === 'upcoming' ? (
          <>
            {pendingInbound.map((r) => {
              const meta = ACTIVITY_TYPE_META[r.activity_type];
              const counterpart = r.counterpart_name ?? 'A seeker';
              return (
                <Card key={r.id} shadow>
                  <Link
                    href={`/plans/${r.id}`}
                    className={styles.pendingRowLink}
                    aria-label={`Open request from ${counterpart}`}
                  >
                    <CounterpartAvatar
                      name={counterpart}
                      photos={r.counterpart_photo_urls ?? []}
                      size={56}
                    />
                    <div className={styles.rowMain}>
                      <p className={styles.rowName}>
                        {counterpart} wants to share {meta.label.toLowerCase()}
                      </p>
                      <p className={styles.rowMeta}>
                        {r.venue_name ? `${r.venue_name} · ` : ''}
                        {formatScheduled(r.proposed_time)}
                      </p>
                      {r.message ? (
                        <p
                          className={styles.rowMeta}
                          style={{ marginTop: '0.375rem', fontStyle: 'italic' }}
                        >
                          “{r.message}”
                        </p>
                      ) : null}
                      <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.375rem' }}>
                        <Badge activity={r.activity_type}>{meta.label}</Badge>
                        <span className={`${styles.statusPill} ${styles.awaiting ?? ''}`}>
                          Awaiting your response
                        </span>
                      </div>
                    </div>
                  </Link>
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                    <Button
                      variant="primary"
                      loading={respondingId === r.id}
                      onClick={() => void respond(r.id, 'accepted')}
                    >
                      Accept
                    </Button>
                    <Button
                      variant="secondary"
                      loading={respondingId === r.id}
                      onClick={() => void respond(r.id, 'declined')}
                    >
                      Decline
                    </Button>
                  </div>
                </Card>
              );
            })}

            {pendingOutbound.map((r) => {
              const meta = ACTIVITY_TYPE_META[r.activity_type];
              const counterpart = r.counterpart_name ?? 'your companion';
              return (
                <Card key={r.id}>
                  <Link
                    href={`/plans/${r.id}`}
                    className={styles.pendingRowLink}
                    aria-label={`Open your request to ${counterpart}`}
                  >
                    <CounterpartAvatar
                      name={counterpart}
                      photos={r.counterpart_photo_urls ?? []}
                      size={56}
                    />
                    <div className={styles.rowMain}>
                      <p className={styles.rowName}>Waiting on {counterpart}</p>
                      <p className={styles.rowMeta}>
                        {meta.label} · {formatScheduled(r.proposed_time)}
                        {r.venue_name ? ` · ${r.venue_name}` : ''}
                      </p>
                      <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.375rem' }}>
                        <Badge activity={r.activity_type}>{meta.label}</Badge>
                        <span className={`${styles.statusPill} ${styles.awaiting ?? ''}`}>
                          Awaiting response
                        </span>
                      </div>
                    </div>
                    <span
                      aria-hidden
                      style={{ color: 'var(--color-text-secondary)', fontSize: '1.25rem' }}
                    >
                      ›
                    </span>
                  </Link>
                </Card>
              );
            })}

            {upcomingBookings.map((b) => {
              const meta = ACTIVITY_TYPE_META[b.activity_type];
              const counterpart = b.counterpart_name ?? 'Your companion';
              return (
                <Card key={b.id} shadow>
                  <div className={styles.bookingRow}>
                    <CounterpartAvatar
                      name={counterpart}
                      photos={b.counterpart_photo_urls ?? []}
                      size={56}
                    />
                    <Link
                      href={`/plans/by-booking/${b.id}`}
                      className={styles.bookingRowLink}
                      aria-label={`Open plan details with ${counterpart}`}
                    >
                      <div className={styles.rowMain}>
                        <p className={styles.rowName}>{counterpart}</p>
                        <p className={styles.rowMeta}>
                          {b.venue_name} · {formatScheduled(b.scheduled_time)}
                        </p>
                        <div style={{ marginTop: '0.375rem', display: 'flex', gap: '0.375rem' }}>
                          <Badge activity={b.activity_type}>{meta.label}</Badge>
                          <span
                            className={[styles.statusPill, bookingStatusClass(b.status)].join(' ')}
                          >
                            {b.status}
                          </span>
                        </div>
                      </div>
                    </Link>
                    <button
                      type="button"
                      className={styles.bookingChatButton}
                      aria-label={`Chat with ${counterpart}`}
                      title={`Chat with ${counterpart}`}
                      onClick={() => openChat(b.id)}
                    >
                      <span aria-hidden>💬</span>
                    </button>
                  </div>
                </Card>
              );
            })}

            {upcomingEmpty ? (
              <EmptyState
                title="Nothing upcoming"
                action={
                  <Button as={Link} href="/discover" variant="primary">
                    Find a companion
                  </Button>
                }
              >
                Pick an activity, find a verified companion, and send a request.
              </EmptyState>
            ) : null}
          </>
        ) : (
          <>
            {pastBookings.map((b) => {
              const meta = ACTIVITY_TYPE_META[b.activity_type];
              return (
                <Card key={b.id} as={Link} href={`/plans/by-booking/${b.id}`}>
                  <div className={styles.row}>
                    <CounterpartAvatar
                      name={b.counterpart_name ?? 'A companion'}
                      photos={b.counterpart_photo_urls ?? []}
                      size={56}
                    />
                    <div className={styles.rowMain}>
                      <p className={styles.rowName}>{b.counterpart_name ?? 'A companion'}</p>
                      <p className={styles.rowMeta}>
                        {b.venue_name} · {formatScheduled(b.scheduled_time)}
                      </p>
                      <div style={{ marginTop: '0.375rem', display: 'flex', gap: '0.375rem' }}>
                        <Badge activity={b.activity_type}>{meta.label}</Badge>
                        <span
                          className={[styles.statusPill, bookingStatusClass(b.status)].join(' ')}
                        >
                          {b.status}
                        </span>
                      </div>
                    </div>
                    <span
                      aria-hidden
                      style={{ color: 'var(--color-text-secondary)', fontSize: '1.25rem' }}
                    >
                      ›
                    </span>
                  </div>
                </Card>
              );
            })}

            {[...declinedInbound, ...declinedOutbound].map((r) => {
              const meta = ACTIVITY_TYPE_META[r.activity_type];
              const heading =
                r.companion_id === r.companion_id // always true; just to keep TS happy
                  ? declinedOutbound.includes(r)
                    ? `${r.counterpart_name ?? 'Your companion'} declined`
                    : `You declined ${r.counterpart_name ?? 'a seeker'}`
                  : '';
              return (
                <Card key={r.id} as={Link} href={`/plans/${r.id}`}>
                  <div className={styles.row}>
                    <CounterpartAvatar
                      name={r.counterpart_name ?? 'Someone'}
                      photos={r.counterpart_photo_urls ?? []}
                      size={56}
                    />
                    <div className={styles.rowMain}>
                      <p className={styles.rowName}>{heading}</p>
                      <p className={styles.rowMeta}>
                        {meta.label} · {formatScheduled(r.proposed_time)}
                        {r.venue_name ? ` · ${r.venue_name}` : ''}
                      </p>
                      <div style={{ marginTop: '0.375rem', display: 'flex', gap: '0.375rem' }}>
                        <Badge activity={r.activity_type}>{meta.label}</Badge>
                        <span className={`${styles.statusPill} ${styles.cancelled ?? ''}`}>
                          Declined
                        </span>
                      </div>
                    </div>
                    <span
                      aria-hidden
                      style={{ color: 'var(--color-text-secondary)', fontSize: '1.25rem' }}
                    >
                      ›
                    </span>
                  </div>
                </Card>
              );
            })}

            {pastEmpty ? (
              <EmptyState title="No past plans yet">
                Completed, cancelled, and declined plans show up here.
              </EmptyState>
            ) : null}
          </>
        )}
      </section>
    </main>
  );
}
