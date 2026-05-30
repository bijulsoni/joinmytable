'use client';

// Approve / Reject buttons for a single pending applicant.
//
// On success we router.refresh() so the applicant drops out of the
// server-rendered list (and so the signed image URLs aren't kept stale).
// We also flip into a "done" pill + disable the buttons so a fast double
// click can't fire a second decision before the refresh lands.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { decideVerificationAction } from './actions';
import shared from '../styles.module.css';

type Props = {
  userId: string;
  email: string | null;
};

export default function VerificationActions({ userId, email }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<'approve' | 'reject' | null>(null);

  function decide(decision: 'approve' | 'reject') {
    setError(null);

    // Rejecting is destructive (un-verifies them) — make the admin confirm.
    if (decision === 'reject') {
      const who = email ? ` ${email}` : '';
      if (!window.confirm(`Reject${who}? They'll be sent back to unverified.`)) {
        return;
      }
    }

    startTransition(async () => {
      const result = await decideVerificationAction({ userId, decision });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDone(decision);
      // Re-pull the list so this applicant disappears from "pending".
      router.refresh();
    });
  }

  if (done) {
    return (
      <span className={done === 'approve' ? shared.pillGood : shared.pillMuted}>
        {done === 'approve' ? '✅ Approved' : '🚫 Rejected'}
      </span>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          className={`${shared.btn} ${shared.btnPrimary}`}
          disabled={isPending}
          onClick={() => decide('approve')}
        >
          {isPending ? 'Saving…' : 'Approve'}
        </button>
        <button
          type="button"
          className={`${shared.btn} ${shared.btnDanger}`}
          disabled={isPending}
          onClick={() => decide('reject')}
        >
          Reject
        </button>
      </div>
      {error ? (
        <p className={shared.error} style={{ marginTop: '0.5rem' }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
