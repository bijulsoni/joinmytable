'use client';

// Booking lifecycle actions on a confirmed booking: "We met / Mark
// complete" and "Cancel". Shown only while the booking is `confirmed`.
//
//   complete → PATCH /api/bookings/[id]/complete  (confirmed → completed)
//   cancel   → PATCH /api/bookings/[id]/cancel    (confirmed → cancelled)
//
// Marking complete is the founder's signal to pay the companion (manual
// Venmo/Zelle during beta) and is the same hook automated escrow will use.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import { StatusMessage } from '@/components/StatusMessage';
import styles from './styles.module.css';

interface Props {
  bookingId: string;
  bookingStatus: string | null;
}

export function BookingActions({ bookingId, bookingStatus }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<'complete' | 'cancel' | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (bookingStatus !== 'confirmed') {
    if (bookingStatus === 'completed') {
      return <p className={styles.bookingDone}>✓ This activity is marked complete.</p>;
    }
    if (bookingStatus === 'cancelled') {
      return <p className={styles.bookingDone}>This booking was cancelled.</p>;
    }
    return null;
  }

  async function act(kind: 'complete' | 'cancel') {
    if (kind === 'cancel' && !window.confirm('Cancel this booking? The fee is refunded.')) return;
    setBusy(kind);
    setError(null);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/${kind}`, {
        method: 'PATCH',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        throw new Error(body.error?.message ?? `Could not ${kind} (${res.status}).`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not ${kind} the booking.`);
      setBusy(null);
    }
  }

  return (
    <section className={styles.bookingActions}>
      <Button
        variant="primary"
        loading={busy === 'complete'}
        disabled={busy !== null}
        onClick={() => void act('complete')}
      >
        We met — mark complete
      </Button>
      <Button
        variant="secondary"
        loading={busy === 'cancel'}
        disabled={busy !== null}
        onClick={() => void act('cancel')}
      >
        Cancel booking
      </Button>
      {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
    </section>
  );
}
