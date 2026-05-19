'use client';

// Inline accept/decline CTA for the request detail page.

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import { OpenChatButton } from '@/components/chat/OpenChatButton';
import { useChatDock } from '@/lib/chat/dock-context';
import type { RequestStatus } from '@/lib/types';
import styles from './styles.module.css';

interface Props {
  requestId: string;
  status: RequestStatus;
  callerRole: 'seeker' | 'companion';
  bookingId: string | null;
  companionUserId: string;
}

export function RespondActions({
  requestId,
  status,
  callerRole,
  bookingId,
  companionUserId,
}: Props) {
  const router = useRouter();
  const { openChat } = useChatDock();
  const [busy, setBusy] = useState<'accepted' | 'declined' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const respond = async (next: 'accepted' | 'declined') => {
    setBusy(next);
    setError(null);
    try {
      const res = await fetch(`/api/requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        throw new Error(body.error?.message ?? `Could not respond (${res.status}).`);
      }
      const body = (await res.json()) as { booking_id: string | null };
      if (next === 'accepted' && body.booking_id) {
        openChat(body.booking_id);
        router.refresh();
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not respond.');
    } finally {
      setBusy(null);
    }
  };

  if (status === 'accepted') {
    return (
      <div className={styles.ctaRow}>
        {bookingId ? (
          <OpenChatButton bookingId={bookingId} fullWidth />
        ) : (
          <p className={styles.helper}>Booking is being set up; refresh in a moment.</p>
        )}
      </div>
    );
  }

  if (status === 'declined') {
    return (
      <div className={styles.ctaRow}>
        {callerRole === 'seeker' ? (
          <Button as={Link} href={`/companions/${companionUserId}`} variant="secondary" fullWidth>
            Try another time →
          </Button>
        ) : null}
      </div>
    );
  }

  // status === 'requested'
  if (callerRole === 'companion') {
    return (
      <div className={styles.ctaRow}>
        {error ? <p className={styles.error}>{error}</p> : null}
        <div className={styles.respondRow}>
          <Button
            variant="primary"
            loading={busy === 'accepted'}
            onClick={() => void respond('accepted')}
            fullWidth
          >
            Accept
          </Button>
          <Button
            variant="secondary"
            loading={busy === 'declined'}
            onClick={() => void respond('declined')}
            fullWidth
          >
            Decline
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.ctaRow}>
      <p className={styles.helper}>Waiting for the companion to respond.</p>
    </div>
  );
}
