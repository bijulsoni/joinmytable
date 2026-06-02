'use client';

// Seeker's "Pay the fee" button on a confirmed, unpaid booking.
//
// POSTs to /api/payments/checkout, then redirects to the Stripe-hosted
// Checkout page. On return, Stripe sends ?paid=1 and the webhook flips
// the booking to paid (so on refresh this shows "Paid").

import { useState } from 'react';
import { Button } from '@/components/ui';
import { StatusMessage } from '@/components/StatusMessage';
import styles from './styles.module.css';

interface Props {
  bookingId: string;
  paid: boolean;
  /** The fee in dollars, for the button label. */
  fee?: number | null;
}

export function PayButton({ bookingId, paid, fee }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (paid) {
    return <p className={styles.bookingDone}>✓ Paid — you’re all set.</p>;
  }

  async function pay() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/payments/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ bookingId }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: { message?: string };
      };
      if (!res.ok || !body.url) {
        throw new Error(body.error?.message ?? `Could not start checkout (${res.status}).`);
      }
      window.location.href = body.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start checkout.');
      setBusy(false);
    }
  }

  return (
    <section className={styles.bookingActions}>
      <Button variant="primary" loading={busy} disabled={busy} onClick={() => void pay()}>
        {fee ? `Pay $${fee} fee` : 'Pay the fee'}
      </Button>
      {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
    </section>
  );
}
