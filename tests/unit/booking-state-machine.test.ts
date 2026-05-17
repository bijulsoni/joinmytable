// Unit tests for the request + booking lifecycle transition tables.
//
// CLAUDE.md "Booking state machine":
//   REQUESTED -> ACCEPTED -> CONFIRMED -> COMPLETED (escrow releases,
//                                                    reviews unlock)
//             \> DECLINED   \> CANCELLED (escrow refunds)
//
// The codebase models this as two separate transition maps because the
// status column splits across two tables:
//   - meal_requests.status: requested | accepted | declined
//       (acceptance spawns a bookings row; subsequent state lives on the
//       booking, not the request, so accepted/declined are terminal on
//       this table.)
//   - bookings.status:      confirmed | completed | cancelled
//       (a booking is created in `confirmed` state immediately on
//       acceptance; the wider "ACCEPTED -> CONFIRMED" transition in the
//       CLAUDE.md diagram is an automatic, server-side step rather than
//       a separately persisted state.)
//
// Pinning the contents here means the Frontend's optimistic UI cannot
// drift from the API enforcement, and a future migration that adds /
// removes a state will trip these tests in CI.

import { describe, it, expect } from 'vitest';
import {
  BOOKING_NEXT_STATES,
  BOOKING_STATUSES,
  REQUEST_NEXT_STATES,
  REQUEST_STATUSES,
  type BookingStatus,
  type RequestStatus,
} from '@/lib/types';

const REQUEST_TERMINAL: RequestStatus[] = ['accepted', 'declined'];
const BOOKING_TERMINAL: BookingStatus[] = ['completed', 'cancelled'];

describe('meal_requests state machine (REQUEST_NEXT_STATES)', () => {
  it('lists exactly the three statuses from CLAUDE.md', () => {
    expect(Array.from(REQUEST_STATUSES).sort()).toEqual(
      ['accepted', 'declined', 'requested'].sort(),
    );
  });

  it('requested -> accepted is allowed', () => {
    expect(REQUEST_NEXT_STATES.requested).toContain('accepted');
  });

  it('requested -> declined is allowed', () => {
    expect(REQUEST_NEXT_STATES.requested).toContain('declined');
  });

  it.each(REQUEST_TERMINAL)('%s has no outgoing transitions (terminal)', (s) => {
    expect(REQUEST_NEXT_STATES[s]).toEqual([]);
  });

  it('requested cannot skip directly to a booking state (handled on the bookings table)', () => {
    const next = REQUEST_NEXT_STATES.requested as readonly string[];
    expect(next).not.toContain('confirmed');
    expect(next).not.toContain('completed');
    expect(next).not.toContain('cancelled');
  });

  it.each(REQUEST_TERMINAL)('%s cannot transition to anything (no revival)', (terminal) => {
    for (const candidate of REQUEST_STATUSES) {
      expect(REQUEST_NEXT_STATES[terminal]).not.toContain(candidate);
    }
  });
});

describe('bookings state machine (BOOKING_NEXT_STATES)', () => {
  it('lists exactly the three statuses from CLAUDE.md', () => {
    expect(Array.from(BOOKING_STATUSES).sort()).toEqual(
      ['cancelled', 'completed', 'confirmed'].sort(),
    );
  });

  it('confirmed -> completed is allowed (escrow releases, reviews unlock)', () => {
    expect(BOOKING_NEXT_STATES.confirmed).toContain('completed');
  });

  it('confirmed -> cancelled is allowed (escrow refunds)', () => {
    expect(BOOKING_NEXT_STATES.confirmed).toContain('cancelled');
  });

  it.each(BOOKING_TERMINAL)('%s is terminal (no outgoing transitions)', (s) => {
    expect(BOOKING_NEXT_STATES[s]).toEqual([]);
  });

  it.each(BOOKING_TERMINAL)('%s can never be re-confirmed (no revival)', (terminal) => {
    for (const candidate of BOOKING_STATUSES) {
      expect(BOOKING_NEXT_STATES[terminal]).not.toContain(candidate);
    }
  });
});

describe('end-to-end transition matrix', () => {
  // The QA prompt enumerates these specific invariants; we pin them as
  // an explicit truth table so a future map edit cannot accidentally
  // un-pin one without showing up in the diff.
  it.each([
    ['requested', 'accepted', true, 'request'],
    ['requested', 'declined', true, 'request'],
    ['confirmed', 'completed', true, 'booking'],
    ['confirmed', 'cancelled', true, 'booking'],
    // Skip-state attempts on the request table:
    ['requested', 'confirmed', false, 'request'],
    ['requested', 'completed', false, 'request'],
    ['requested', 'cancelled', false, 'request'],
    // Terminal-state revival attempts:
    ['completed', 'confirmed', false, 'booking'],
    ['completed', 'completed', false, 'booking'],
    ['cancelled', 'confirmed', false, 'booking'],
    ['cancelled', 'cancelled', false, 'booking'],
    ['declined', 'requested', false, 'request'],
    ['declined', 'accepted', false, 'request'],
    ['accepted', 'declined', false, 'request'],
  ] as const)('%s -> %s (%s table) allowed=%s', (from, to, allowed, table) => {
    const map = table === 'request' ? REQUEST_NEXT_STATES : BOOKING_NEXT_STATES;
    const nexts = (map as Record<string, readonly string[]>)[from] ?? [];
    expect(nexts.includes(to)).toBe(allowed);
  });
});
