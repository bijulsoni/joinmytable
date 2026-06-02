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

// One payment row, narrowed to just what the Payout cell needs. There is
// at most one payment per booking; we tolerate zero.
interface PaymentRow {
  booking_id: string;
  escrow_status: EscrowStatus;
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

// Status → pill style. confirmed = upcoming/in-flight (warn), completed =
// done + payable (good), cancelled = dead (muted).
const STATUS_PILL: Record<BookingStatus, string | undefined> = {
  confirmed: shared.pillWarn,
  completed: shared.pillGood,
  cancelled: shared.pillMuted,
};

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
  const escrowByBooking = new Map<string, EscrowStatus>();
  const bookingIds = bookings.map((b) => b.id);
  if (bookingIds.length > 0) {
    const { data: paymentsData } = await admin
      .from('payments')
      .select('booking_id, escrow_status')
      .in('booking_id', bookingIds);
    for (const p of (paymentsData ?? []) as PaymentRow[]) {
      escrowByBooking.set(p.booking_id, p.escrow_status);
    }
  }

  // Summary counts + outstanding payout volume (sum of completed fees).
  let confirmed = 0;
  let completed = 0;
  let cancelled = 0;
  let completedFees = 0;
  for (const b of bookings) {
    if (b.status === 'confirmed') confirmed += 1;
    else if (b.status === 'completed') completed += 1;
    else if (b.status === 'cancelled') cancelled += 1;
    if (b.status === 'completed') {
      const fee = typeof b.companion_fee === 'string' ? Number(b.companion_fee) : b.companion_fee;
      if (Number.isFinite(fee)) completedFees += fee;
    }
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
        {countLabel} booking{total === 1 ? '' : 's'} · {confirmed} confirmed · {completed} completed
        · {cancelled} cancelled · {formatFee(completedFees)} in completed-booking fees.
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

                // Payout hint: only completed bookings are payable. If a
                // payment row says the escrow was released, treat it as
                // already paid; otherwise it's still pending.
                let payout = '—';
                if (b.status === 'completed') {
                  payout =
                    escrowByBooking.get(b.id) === 'released'
                      ? '✓ Paid'
                      : '⏳ Pay companion via Venmo/Zelle';
                }

                return (
                  <tr key={b.id}>
                    <td title={fullWhen(b.scheduled_time)}>{formatWhen(b.scheduled_time)}</td>
                    <td>{activity ? ACTIVITY_TYPE_META[activity].label : b.activity_type}</td>
                    <td>{seekerName}</td>
                    <td>{companionName}</td>
                    <td>{formatFee(b.companion_fee)}</td>
                    <td>
                      <span className={`${shared.pill} ${STATUS_PILL[b.status] ?? ''}`}>
                        {b.status}
                      </span>
                    </td>
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
