'use client';

// /requests (no companion param) — inbound + outbound request hub.
//
// Inbound (companion view): each request has Accept / Decline buttons.
// On accept, a booking is auto-created server-side and we redirect into
// its chat. Outbound (seeker view): each request shows status; accepted
// rows surface a CTA to open the chat for the auto-created booking.

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Avatar, Badge, Button, Card, EmptyState, LoadingBlock } from '@/components/ui';
import { ACTIVITY_TYPE_META, type ActivityType, type RequestStatus } from '@/lib/types';
import styles from './styles.module.css';

interface RequestItem {
  id: string;
  seeker_id: string;
  companion_id: string;
  activity_type: ActivityType;
  proposed_time: string;
  venue_name: string | null;
  venue_location: string | null;
  budget_tier: string | null;
  message: string | null;
  status: RequestStatus;
  created_at: string;
  counterpart_name: string | null;
  booking_id: string | null;
}

interface RequestsResponse {
  inbound: RequestItem[];
  outbound: RequestItem[];
}

function formatTime(iso: string): string {
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

function statusToneClass(status: RequestStatus): string {
  return (
    {
      requested: styles.statusRequested ?? '',
      accepted: styles.statusAccepted ?? '',
      declined: styles.statusDeclined ?? '',
    }[status] ?? ''
  );
}

export function RequestsHub() {
  const router = useRouter();
  const search = useSearchParams();
  const justSent = search.get('sent') === '1';
  const [data, setData] = useState<RequestsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/requests', { cache: 'no-store' });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        throw new Error(body.error?.message ?? `Could not load requests (${res.status}).`);
      }
      const body = (await res.json()) as RequestsResponse;
      setData(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load requests.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const respond = async (id: string, status: 'accepted' | 'declined') => {
    setBusyId(id);
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
      const body = (await res.json()) as { booking_id: string | null };
      if (status === 'accepted' && body.booking_id) {
        router.push(`/chat/${body.booking_id}`);
        return;
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not respond to request.');
    } finally {
      setBusyId(null);
    }
  };

  if (!data && !error) return <LoadingBlock />;

  return (
    <main className={styles.hubShell}>
      <header className={styles.hubHeader}>
        <h1 className={styles.hubTitle}>Requests</h1>
        <p className={styles.hubLede}>
          Inbound requests need your reply. Outbound requests show the status from your companion.
        </p>
      </header>

      {justSent ? (
        <div className={styles.successBanner}>
          ✓ Your request is on its way. You&apos;ll see it below; the companion will accept or
          decline.
        </div>
      ) : null}

      {error ? <div className={styles.errorBanner}>{error}</div> : null}

      <section aria-labelledby="inbound-heading" className={styles.hubSection}>
        <h2 id="inbound-heading" className={styles.hubSectionHeading}>
          Inbound · {data?.inbound.length ?? 0}
        </h2>
        {data && data.inbound.length === 0 ? (
          <EmptyState title="No inbound requests yet">
            Seekers who want to share an activity with you will appear here.
          </EmptyState>
        ) : (
          <ul className={styles.requestList}>
            {data?.inbound.map((r) => (
              <li key={r.id}>
                <Card>
                  <div className={styles.requestRow}>
                    <Avatar name={r.counterpart_name ?? 'Seeker'} size={48} />
                    <div className={styles.requestMain}>
                      <p className={styles.requestName}>{r.counterpart_name ?? 'A seeker'}</p>
                      <p className={styles.requestMeta}>
                        {ACTIVITY_TYPE_META[r.activity_type].label} · {formatTime(r.proposed_time)}
                        {r.venue_name ? ` · ${r.venue_name}` : ''}
                      </p>
                      {r.message ? <p className={styles.requestMessage}>“{r.message}”</p> : null}
                      <div className={styles.requestActions}>
                        <Badge activity={r.activity_type}>
                          {ACTIVITY_TYPE_META[r.activity_type].label}
                        </Badge>
                        <span className={`${styles.statusPill} ${statusToneClass(r.status)}`}>
                          {r.status}
                        </span>
                      </div>
                    </div>
                  </div>
                  {r.status === 'requested' ? (
                    <div className={styles.respondRow}>
                      <Button
                        variant="primary"
                        loading={busyId === r.id}
                        onClick={() => void respond(r.id, 'accepted')}
                      >
                        Accept
                      </Button>
                      <Button
                        variant="secondary"
                        loading={busyId === r.id}
                        onClick={() => void respond(r.id, 'declined')}
                      >
                        Decline
                      </Button>
                    </div>
                  ) : r.status === 'accepted' && r.booking_id ? (
                    <div className={styles.respondRow}>
                      <Button as={Link} href={`/chat/${r.booking_id}`}>
                        Open chat
                      </Button>
                    </div>
                  ) : null}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="outbound-heading" className={styles.hubSection}>
        <h2 id="outbound-heading" className={styles.hubSectionHeading}>
          Outbound · {data?.outbound.length ?? 0}
        </h2>
        {data && data.outbound.length === 0 ? (
          <EmptyState
            title="No outbound requests yet"
            action={
              <Button as={Link} href="/discover">
                Find a companion
              </Button>
            }
          >
            Browse companions and send a request to share a meal, coffee, or drink.
          </EmptyState>
        ) : (
          <ul className={styles.requestList}>
            {data?.outbound.map((r) => (
              <li key={r.id}>
                <Card>
                  <div className={styles.requestRow}>
                    <Avatar name={r.counterpart_name ?? 'Companion'} size={48} />
                    <div className={styles.requestMain}>
                      <p className={styles.requestName}>{r.counterpart_name ?? 'A companion'}</p>
                      <p className={styles.requestMeta}>
                        {ACTIVITY_TYPE_META[r.activity_type].label} · {formatTime(r.proposed_time)}
                        {r.venue_name ? ` · ${r.venue_name}` : ''}
                      </p>
                      <div className={styles.requestActions}>
                        <Badge activity={r.activity_type}>
                          {ACTIVITY_TYPE_META[r.activity_type].label}
                        </Badge>
                        <span className={`${styles.statusPill} ${statusToneClass(r.status)}`}>
                          {r.status}
                        </span>
                      </div>
                    </div>
                  </div>
                  {r.status === 'accepted' && r.booking_id ? (
                    <div className={styles.respondRow}>
                      <Button as={Link} href={`/chat/${r.booking_id}`}>
                        Open chat
                      </Button>
                    </div>
                  ) : null}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
