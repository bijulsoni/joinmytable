'use client';

// /bookings - list view with upcoming / past tabs.
//
// Wires to GET /api/bookings?scope=upcoming|past once that endpoint
// exists. Until then we surface a clear empty state pointing the user
// at discovery so the screen is not a dead end during development.

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Avatar, Badge, Button, Card, EmptyState } from '@/components/ui';
import { StatusMessage } from '@/components/StatusMessage';
import { ACTIVITY_TYPE_META, type ActivityType, type BookingStatus } from '@/lib/types';
import styles from './styles.module.css';

interface BookingListItem {
  id: string;
  activity_type: ActivityType;
  venue_name: string;
  scheduled_time: string;
  status: BookingStatus;
  counterpart_name: string;
  counterpart_photo_url: string | null;
}

interface BookingsResponse {
  bookings: BookingListItem[];
}

interface ApiErrorBody {
  error?: { code?: string; message?: string };
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

function statusPillClass(status: BookingStatus): string {
  const map: Record<BookingStatus, string> = {
    confirmed: styles.confirmed ?? '',
    completed: styles.completed ?? '',
    cancelled: styles.cancelled ?? '',
  };
  return map[status];
}

function statusLabel(status: BookingStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function BookingsList() {
  const [tab, setTab] = useState<Tab>('upcoming');
  const [bookings, setBookings] = useState<BookingListItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [endpointMissing, setEndpointMissing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setEndpointMissing(false);
    try {
      const res = await fetch(`/api/bookings?scope=${tab}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (res.status === 404) {
        setEndpointMissing(true);
        setBookings([]);
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as ApiErrorBody;
        throw new Error(body.error?.message ?? `Could not load bookings (${res.status}).`);
      }
      const body = (await res.json()) as BookingsResponse;
      setBookings(body.bookings ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load bookings.');
      setBookings([]);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    void load();
  }, [load]);

  const content = useMemo(() => {
    if (loading && !bookings) {
      return (
        <>
          <div className={styles.skeleton} />
          <div className={styles.skeleton} />
        </>
      );
    }
    if (error) {
      return <StatusMessage tone="error">{error}</StatusMessage>;
    }
    if (endpointMissing) {
      return (
        <EmptyState
          title="Bookings API is not live yet"
          action={
            <Button as={Link} href="/discover" variant="primary">
              Browse companions
            </Button>
          }
        >
          The Core API agent will ship <code>GET /api/bookings</code> in Phase 3. Until then this
          list is empty by design.
        </EmptyState>
      );
    }
    if (!bookings || bookings.length === 0) {
      return (
        <EmptyState
          title={tab === 'upcoming' ? 'No upcoming bookings' : 'No past bookings yet'}
          action={
            <Button as={Link} href="/discover" variant="primary">
              Find a companion
            </Button>
          }
        >
          {tab === 'upcoming'
            ? 'Pick an activity, find a verified companion, and send a request.'
            : 'Bookings show up here once they are completed or cancelled.'}
        </EmptyState>
      );
    }
    return bookings.map((b) => {
      const meta = ACTIVITY_TYPE_META[b.activity_type];
      const href = b.status === 'confirmed' ? `/chat/${b.id}` : `/bookings/${b.id}`;
      return (
        <Card key={b.id} as={Link} href={href} shadow>
          <div className={styles.row}>
            <Avatar src={b.counterpart_photo_url} name={b.counterpart_name} size={56} />
            <div className={styles.rowMain}>
              <p className={styles.rowName}>{b.counterpart_name}</p>
              <p className={styles.rowMeta}>
                {b.venue_name} · {formatScheduled(b.scheduled_time)}
              </p>
              <div style={{ marginTop: '0.375rem', display: 'flex', gap: '0.375rem' }}>
                <Badge activity={b.activity_type}>{meta.label}</Badge>
                <span className={[styles.statusPill, statusPillClass(b.status)].join(' ')}>
                  {statusLabel(b.status)}
                </span>
              </div>
            </div>
            <span aria-hidden style={{ color: 'var(--color-text-secondary)', fontSize: '1.25rem' }}>
              ›
            </span>
          </div>
        </Card>
      );
    });
  }, [bookings, loading, error, endpointMissing, tab]);

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <h1 className={styles.title}>Bookings</h1>
      </header>

      <div className={styles.tabs} role="tablist" aria-label="Booking timeline">
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
        {content}
      </section>
    </main>
  );
}
