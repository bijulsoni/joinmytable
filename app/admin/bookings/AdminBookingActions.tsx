'use client';

// "Mark complete (override)" button for a confirmed booking, for when the
// seeker is unresponsive and the companion is owed their payout. Calls
// the admin override action, then refreshes the list.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { adminCompleteBookingAction } from './actions';
import shared from '../styles.module.css';

export function AdminBookingActions({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function complete() {
    if (!window.confirm('Mark this booking complete on the seeker’s behalf? This releases payout.'))
      return;
    setError(null);
    startTransition(async () => {
      const res = await adminCompleteBookingAction({ bookingId });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        className={`${shared.btn} ${shared.btnGhost}`}
        disabled={pending}
        onClick={complete}
      >
        {pending ? '…' : 'Mark complete'}
      </button>
      {error ? (
        <p className={shared.error} style={{ marginTop: '0.25rem' }}>
          {error}
        </p>
      ) : null}
    </>
  );
}
