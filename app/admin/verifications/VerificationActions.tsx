'use client';

// Tiered approve / reject for a single pending applicant.
//
//   Approve · Basic   → selfie reviewed → discoverable in Explore, tagged
//                        "Basic". Use when they only sent a selfie.
//   Approve · Full ID → ID + selfie reviewed → "Verified" + can accept
//                        meets. Use when a government ID is present.
//   Reject            → back to unverified (destructive, confirmed).
//
// On success we router.refresh() so the applicant drops out of the list
// (and the signed image URLs aren't kept stale), and flip to a done pill.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { decideVerificationAction } from './actions';
import shared from '../styles.module.css';

type Decision = 'approve_basic' | 'approve_full' | 'reject';

type Props = {
  userId: string;
  email: string | null;
  /** Whether an ID document was uploaded — enables the Full ID approve. */
  hasId: boolean;
};

export default function VerificationActions({ userId, email, hasId }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Decision | null>(null);

  function decide(decision: Decision) {
    setError(null);

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
      router.refresh();
    });
  }

  if (done) {
    const label =
      done === 'reject' ? '🚫 Rejected' : done === 'approve_full' ? '✅ Verified' : '✅ Basic';
    return <span className={done === 'reject' ? shared.pillMuted : shared.pillGood}>{label}</span>;
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          className={`${shared.btn} ${shared.btnPrimary}`}
          disabled={isPending}
          onClick={() => decide('approve_full')}
          title={hasId ? 'ID present — full verification' : 'No ID uploaded yet'}
        >
          {isPending ? 'Saving…' : 'Approve · Full ID'}
        </button>
        <button
          type="button"
          className={shared.btn}
          disabled={isPending}
          onClick={() => decide('approve_basic')}
          title="Selfie only — discoverable, tagged Basic"
        >
          Approve · Basic
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
      {!hasId ? (
        <p className={shared.help} style={{ marginTop: '0.4rem' }}>
          No government ID uploaded — “Full ID” will mark them verified anyway, so only use it if
          you’ve confirmed identity another way. Otherwise approve as Basic.
        </p>
      ) : null}
      {error ? (
        <p className={shared.error} style={{ marginTop: '0.5rem' }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
