'use client';

// /bookings/[id] - confirm & pay.
//
// Renders the booking summary, the fee breakdown, and a Stripe Elements
// card field. The actual Stripe Elements provider + getStripePromise()
// live in `@/lib/stripe/elements.ts`, owned by the Payments agent. That
// module does not exist yet, so this screen renders a clearly-labelled
// placeholder where the card field will go and disables the pay CTA
// until the Payments agent ships.
//
// CLAUDE.md core product rule #11: card data NEVER touches our servers.
// The submit path will call the Payments capture endpoint, which
// returns a client_secret for the Stripe Elements confirmCardPayment
// call. Until then the submit handler short-circuits with an explanation.

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Avatar, Badge, Button, Card } from '@/components/ui';
import { StatusMessage } from '@/components/StatusMessage';
import {
  ACTIVITY_TYPE_META,
  type ActivityType,
  type BookingStatus,
  type BudgetTier,
} from '@/lib/types';
import styles from './styles.module.css';

interface BookingDetail {
  id: string;
  activity_type: ActivityType;
  venue_name: string;
  venue_location: string;
  scheduled_time: string;
  budget_tier: BudgetTier;
  status: BookingStatus;
  companion_fee: string;
  companion_name: string;
  companion_photo_url: string | null;
  /** Caller's role on this booking. */
  caller_role: 'seeker' | 'companion';
}

interface ApiErrorBody {
  error?: { code?: string; message?: string };
}

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

interface ConfirmAndPayProps {
  bookingId: string;
}

export function ConfirmAndPay({ bookingId }: ConfirmAndPayProps) {
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [endpointMissing, setEndpointMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/bookings/${bookingId}`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });
        if (cancelled) return;
        if (res.status === 404) {
          setEndpointMissing(true);
          return;
        }
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as ApiErrorBody;
          throw new Error(body.error?.message ?? `Could not load booking (${res.status}).`);
        }
        const body = (await res.json()) as { booking: BookingDetail };
        setBooking(body.booking);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Could not load booking.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bookingId]);

  const handlePay = useCallback(async () => {
    // Stripe is wired by the Payments agent; without
    // `@/lib/stripe/elements`'s getStripePromise() and a server-side
    // PaymentIntent creator we have no card data to confirm. Surface
    // the gap explicitly so anyone testing the screen knows what is
    // missing rather than seeing a silent no-op.
    setError(
      'Payment will be enabled once the Payments agent ships @/lib/stripe/elements and POST /api/payments/intent.',
    );
  }, []);

  if (loading) {
    return (
      <main className={styles.shell}>
        <header className={styles.header}>
          <h1 className={styles.title}>Confirm &amp; pay</h1>
        </header>
        <div className={styles.content}>
          <Card>Loading booking…</Card>
        </div>
      </main>
    );
  }

  if (endpointMissing) {
    return (
      <main className={styles.shell}>
        <header className={styles.header}>
          <h1 className={styles.title}>Confirm &amp; pay</h1>
          <p className={styles.subtitle}>Booking {bookingId.slice(0, 8)}…</p>
        </header>
        <div className={styles.content}>
          <StatusMessage tone="notice">
            The bookings API (<code>/api/bookings/[id]</code>) is not live yet. Once Core API Phase
            3 ships, this screen will show the booking summary and fee breakdown for payment.
          </StatusMessage>
        </div>
      </main>
    );
  }

  if (error && !booking) {
    return (
      <main className={styles.shell}>
        <header className={styles.header}>
          <h1 className={styles.title}>Confirm &amp; pay</h1>
        </header>
        <div className={styles.content}>
          <StatusMessage tone="error">{error}</StatusMessage>
        </div>
      </main>
    );
  }

  if (!booking) {
    return null;
  }

  const meta = ACTIVITY_TYPE_META[booking.activity_type];
  const isSeeker = booking.caller_role === 'seeker';
  const fee = Number(booking.companion_fee);

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <h1 className={styles.title}>Confirm &amp; pay</h1>
        <p className={styles.subtitle}>
          {isSeeker ? 'Lock in this booking by paying the companionship fee.' : 'Booking details'}
        </p>
      </header>

      <div className={styles.content}>
        {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}

        <Card>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              marginBottom: '0.875rem',
            }}
          >
            <Avatar src={booking.companion_photo_url} name={booking.companion_name} size={48} />
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: 0, fontWeight: 600 }}>{booking.companion_name}</p>
              <Badge activity={booking.activity_type}>{meta.label}</Badge>
            </div>
          </div>
          <div className={styles.summary}>
            <div className={styles.summaryRow}>
              <span className={styles.summaryLabel}>Activity</span>
              <span className={styles.summaryValue}>{meta.label}</span>
            </div>
            <div className={styles.summaryRow}>
              <span className={styles.summaryLabel}>Venue</span>
              <span className={styles.summaryValue}>{booking.venue_name}</span>
            </div>
            <div className={styles.summaryRow}>
              <span className={styles.summaryLabel}>Where</span>
              <span className={styles.summaryValue}>{booking.venue_location}</span>
            </div>
            <div className={styles.summaryRow}>
              <span className={styles.summaryLabel}>When</span>
              <span className={styles.summaryValue}>{formatScheduled(booking.scheduled_time)}</span>
            </div>
            <div className={styles.summaryRow}>
              <span className={styles.summaryLabel}>Budget</span>
              <span className={styles.summaryValue}>{booking.budget_tier}</span>
            </div>
          </div>
        </Card>

        {isSeeker ? (
          <>
            <Card padded>
              <h2 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 700 }}>
                Fee breakdown
              </h2>
              <div className={styles.feeBlock}>
                <div className={styles.feeRow}>
                  <span>Companionship fee</span>
                  <span>${fee.toFixed(2)}</span>
                </div>
                <p className={styles.feeHelp}>
                  You also pay the {meta.label.toLowerCase()} bill at the venue. The seeker always
                  covers the activity cost (CLAUDE.md core rule #3).
                </p>
                <div className={[styles.feeRow, styles.feeRowTotal].join(' ')}>
                  <span>Total companionship fee today</span>
                  <span>${fee.toFixed(2)}</span>
                </div>
              </div>
            </Card>

            <Card padded>
              <h2 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 700 }}>Payment</h2>
              {/*
                Stripe Elements card field goes here. The Payments agent
                owns @/lib/stripe/elements (getStripePromise) and the
                server-side PaymentIntent creator. Until those land we
                surface a placeholder rather than a half-working form so
                no one assumes card capture is wired.
              */}
              <div className={styles.cardField}>
                Card field renders here once <code>@/lib/stripe/elements</code> is shipped by the
                Payments agent.
              </div>
            </Card>

            <p className={styles.escrowNote}>
              <span className={styles.escrowIcon} aria-hidden>
                🔒
              </span>
              <span>
                Your fee is held safely in escrow until after your {meta.label.toLowerCase()}. If
                your booking is cancelled, the fee is refunded.
              </span>
            </p>
          </>
        ) : (
          <StatusMessage tone="notice">
            You&apos;re viewing this booking as a companion. Payment is handled by the seeker.
          </StatusMessage>
        )}

        <Button as={Link} href={`/chat/${booking.id}`} variant="secondary" fullWidth>
          Open chat
        </Button>
      </div>

      {isSeeker ? (
        <div className={styles.stickyCta}>
          <Button fullWidth onClick={handlePay} disabled>
            Pay &amp; confirm booking
          </Button>
        </div>
      ) : null}
    </main>
  );
}
