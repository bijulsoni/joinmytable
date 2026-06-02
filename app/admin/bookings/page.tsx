import type { Metadata } from 'next';
import { authAdminClient } from '@/lib/auth/db';
import {
  ACTIVITY_TYPE_META,
  isActivityType,
  type ActivityType,
  type BookingStatus,
  type EscrowStatus,
} from '@/lib/types';
import shared from '../styles.module.css';

export const metadata: Metadata = { title: 'Bookings · Admin' };

// Always read fresh. During the beta payouts are run by hand off this
// page, so a stale view risks paying a companion twice (or not at all).
export const dynamic = 'force-dynamic';

// Cap the read — this is an internal tool a human scans, not an export.
const MAX_ROWS = 200;

// A booking joined to its originating request's participant names. The
// nested-select shape mirrors app/chat/page.tsx exactly so the FK hints
// (bookings_request_id_fkey, meal_requests_{seeker,companion}_id_fkey)
// stay consistent across surfaces.
interface BookingRow {
  id: string;
  activity_type: string;
  venue_name: string;
  scheduled_time: string;
  companion_fee: number | string;
  status: BookingStatus;
  created_at: string;
  meal_requests: {
    seeker: { name: string | null } | null;
    companion: { name: string | null } | null;
  } | null;
}

// One payment row. paid_at is the real "seeker paid via Stripe" signal
// (escrow_status is the separate held/released lifecycle). At most one per
// booking; we tolerate zero.
interface PaymentRow {
  booking_id: string;
  escrow_status: EscrowStatus;
  paid_at: string | null;
}

// "just now / 5m ago / 3h ago / 2d ago / Mar 4, 2026" — same ladder as
// app/admin/feedback/page.tsx so the admin surfaces read identically.
function formatWhen(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// Full, unambiguous timestamp for the cell's title attribute on hover.
function fullWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

// companion_fee comes back as a numeric string from postgrest; coerce and
// render as a whole-dollar figure (fees are always whole-dollar amounts).
function formatFee(value: number | string): string {
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return '$0';
  return `$${Math.round(n)}`;
}

// The booking lifecycle, spelled out so "confirmed" is never mistaken for
// "paid". A confirmed booking splits on whether the seeker has paid yet.
function lifecycle(status: BookingStatus, paid: boolean): { label: string; pill: string } {
  if (status === 'cancelled') return { label: 'Cancelled', pill: shared.pillMuted ?? '' };
  if (status === 'completed') return { label: 'Completed', pill: shared.pillGood ?? '' };
  if (paid) return { label: 'Paid · ready to meet', pill: shared.pillGood ?? '' };
  return { label: 'Accepted · awaiting payment', pill: shared.pillWarn ?? '' };
}

export default async function AdminBookingsPage() {
  const admin = authAdminClient();

  // Newest first by created_at. The deep join only reaches participant
  // names; payment state is fetched separately and mapped in JS to avoid
  // a fragile nested join through a nullable 1:0..1 relation.
  const { data: bookingsData } = await admin
    .from('bookings')
    .select(
      `id, activity_type, venue_name, scheduled_time, companion_fee, status, created_at,
       meal_requests!bookings_request_id_fkey(
         seeker:users!meal_requests_seeker_id_fkey(name),
         companion:users!meal_requests_companion_id_fkey(name)
       )`,
    )
    .order('created_at', { ascending: false })
    .limit(MAX_ROWS);

  const bookings = (bookingsData ?? []) as unknown as BookingRow[];

  // Map payments by booking_id. 0 or 1 per booking; later rows would just
  // overwrite, but the data model guarantees uniqueness here.
  const paidAtByBooking = new Map<string, string>();
  const bookingIds = bookings.map((b) => b.id);
  if (bookingIds.length > 0) {
    const { data: paymentsData } = await admin
      .from('payments')
      .select('booking_id, escrow_status, paid_at')
      .in('booking_id', bookingIds);
    for (const p of (paymentsData ?? []) as PaymentRow[]) {
      if (p.paid_at) paidAtByBooking.set(p.booking_id, p.paid_at);
    }
  }

  // Summary counts + outstanding payout volume (sum of completed fees).
  let awaitingPayment = 0;
  let paidReady = 0;
  let completed = 0;
  let cancelled = 0;
  let payoutDue = 0; // completed + paid = a companion to pay
  for (const b of bookings) {
    const paid = paidAtByBooking.has(b.id);
    if (b.status === 'cancelled') cancelled += 1;
    else if (b.status === 'completed') {
      completed += 1;
      const fee = typeof b.companion_fee === 'string' ? Number(b.companion_fee) : b.companion_fee;
      if (Number.isFinite(fee)) payoutDue += fee;
    } else if (paid) paidReady += 1;
    else awaitingPayment += 1;
  }

  const total = bookings.length;
  const countLabel = total >= MAX_ROWS ? `${MAX_ROWS}+` : `${total}`;

  return (
    <div className={shared.page}>
      <h1 className={shared.h1}>Bookings</h1>
      <p className={shared.lede}>
        Every booking across the platform. Track who&apos;s meeting whom and run manual payouts here
        — for now companions are paid by hand via Venmo or Zelle once a booking is completed.
      </p>

      {/* Summary: status mix + the dollar volume owed/paid out on completed
          bookings. Newest {MAX_ROWS} bookings only. */}
      <p className={shared.lede}>
        {countLabel} booking{total === 1 ? '' : 's'} · {awaitingPayment} awaiting payment ·{' '}
        {paidReady} paid &amp; ready · {completed} completed · {cancelled} cancelled ·{' '}
        {formatFee(payoutDue)} in completed-booking payouts.
      </p>

      {total === 0 ? (
        <div className={shared.empty}>No bookings yet.</div>
      ) : (
        <div className={shared.tableWrap}>
          <table className={shared.table}>
            <thead>
              <tr>
                <th>When</th>
                <th>Activity</th>
                <th>Seeker</th>
                <th>Companion</th>
                <th>Fee</th>
                <th>Status</th>
                <th>Seeker paid?</th>
                <th>Payout</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => {
                const activity: ActivityType | null = isActivityType(b.activity_type)
                  ? b.activity_type
                  : null;
                const seekerName = b.meal_requests?.seeker?.name ?? '—';
                const companionName = b.meal_requests?.companion?.name ?? '—';
                const paidAt = paidAtByBooking.get(b.id) ?? null;
                const paid = paidAt !== null;
                const stage = lifecycle(b.status, paid);

                // Seeker-paid cell: explicit ✓ + when, or awaiting.
                let paidCell: React.ReactNode = '—';
                if (b.status !== 'cancelled') {
                  paidCell = paid ? (
                    <span
                      className={`${shared.pill} ${shared.pillGood ?? ''}`}
                      title={fullWhen(paidAt)}
                    >
                      ✓ {formatWhen(paidAt)}
                    </span>
                  ) : (
                    <span className={`${shared.pill} ${shared.pillWarn ?? ''}`}>Awaiting</span>
                  );
                }

                // Payout hint: a completed booking with the fee collected is
                // a companion you owe (manual Venmo/Zelle).
                let payout = '—';
                if (b.status === 'completed') {
                  payout = '⏳ Pay companion via Venmo/Zelle';
                }

                return (
                  <tr key={b.id}>
                    <td title={fullWhen(b.scheduled_time)}>{formatWhen(b.scheduled_time)}</td>
                    <td>{activity ? ACTIVITY_TYPE_META[activity].label : b.activity_type}</td>
                    <td>{seekerName}</td>
                    <td>{companionName}</td>
                    <td>{formatFee(b.companion_fee)}</td>
                    <td>
                      <span className={`${shared.pill} ${stage.pill}`}>{stage.label}</span>
                    </td>
                    <td>{paidCell}</td>
                    <td>{payout}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
