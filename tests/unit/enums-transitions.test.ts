// Unit tests for the booking / request lifecycle transition tables.
//
// Owner: Database agent publishes these maps from `lib/types/enums.ts`;
// Core API enforces them on every state-mutating endpoint. Pinning
// the contents here means the Frontend agent's optimistic UI cannot
// drift from the API enforcement.

import { describe, it, expect } from 'vitest';
import {
  BOOKING_NEXT_STATES,
  REQUEST_NEXT_STATES,
  type BookingStatus,
  type RequestStatus,
} from '@/lib/types';

describe('REQUEST_NEXT_STATES', () => {
  it('only allows transitions out of "requested"', () => {
    expect(REQUEST_NEXT_STATES.requested).toEqual([
      'accepted',
      'declined',
      'cancelled',
      'expired',
    ]);
  });

  it.each(['accepted', 'declined', 'cancelled', 'expired'] as RequestStatus[])(
    'treats %s as terminal (no outgoing transitions)',
    (s) => {
      expect(REQUEST_NEXT_STATES[s]).toEqual([]);
    },
  );
});

describe('BOOKING_NEXT_STATES', () => {
  it('allows accepted -> confirmed | cancelled', () => {
    expect(BOOKING_NEXT_STATES.accepted).toEqual(['confirmed', 'cancelled']);
  });

  it('allows confirmed -> completed | cancelled (escrow release / refund off-ramp)', () => {
    expect(BOOKING_NEXT_STATES.confirmed).toEqual(['completed', 'cancelled']);
  });

  it.each(['completed', 'cancelled'] as BookingStatus[])(
    'treats %s as terminal',
    (s) => {
      expect(BOOKING_NEXT_STATES[s]).toEqual([]);
    },
  );

  it('NEVER allows skipping confirmed (escrow must be captured before completion)', () => {
    expect(BOOKING_NEXT_STATES.accepted).not.toContain('completed');
  });

  it('NEVER allows reviving a terminal booking', () => {
    expect(BOOKING_NEXT_STATES.cancelled).not.toContain('confirmed');
    expect(BOOKING_NEXT_STATES.completed).not.toContain('confirmed');
  });
});
