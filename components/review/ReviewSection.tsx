'use client';

// Two-way review surface for one booking.
//
// Reviews are only allowed on COMPLETED bookings and are always two-way
// (core product rule #9). This component:
//   - fetches the caller's review state for the booking
//   - if they haven't reviewed yet: shows a star picker + optional comment
//     and POSTs to /api/reviews (RLS enforces completed + participant +
//     one-per-booking)
//   - if they have: shows their submitted rating read-only (reviews are
//     immutable)
//   - shows the counterpart's review of them, once it exists
//
// Used inline on /plans/[id] (when the booking is complete) and as the
// body of the dedicated /bookings/[id]/review page the review-prompt
// email links to.

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import { StatusMessage } from '@/components/StatusMessage';
import { Stars } from './Stars';
import styles from './review.module.css';

interface ReviewLite {
  rating: number;
  comment: string | null;
  created_at: string;
}

interface BookingReviewState {
  booking: {
    id: string;
    activity_type: string;
    status: string;
    counterpart_name: string;
  };
  caller_role: 'seeker' | 'companion';
  can_review: boolean;
  my_review: ReviewLite | null;
  their_review: ReviewLite | null;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function ReviewSection({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [state, setState] = useState<BookingReviewState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Form state.
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/reviews/booking/${bookingId}`, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        throw new Error(body.error?.message ?? `Could not load reviews (${res.status}).`);
      }
      setState((await res.json()) as BookingReviewState);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load reviews.');
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit() {
    if (rating < 1) {
      setSubmitError('Pick a star rating first.');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          booking_id: bookingId,
          rating,
          comment: comment.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        throw new Error(body.error?.message ?? `Could not submit review (${res.status}).`);
      }
      await load();
      router.refresh();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Could not submit your review.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <section className={styles.section}>
        <p className={styles.muted}>Loading review…</p>
      </section>
    );
  }
  if (loadError || !state) {
    return (
      <section className={styles.section}>
        <StatusMessage tone="error">{loadError ?? 'Could not load review.'}</StatusMessage>
      </section>
    );
  }

  const { booking, my_review, their_review } = state;
  const them = booking.counterpart_name;

  if (!state.can_review) {
    return (
      <section className={styles.section}>
        <h2 className={styles.heading}>Reviews</h2>
        <p className={styles.muted}>
          Reviews unlock once the activity is marked complete. Check back after your meet.
        </p>
      </section>
    );
  }

  const shown = hover || rating;

  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>Rate your experience</h2>

      {my_review ? (
        <div className={styles.block}>
          <div className={styles.blockHead}>
            <span className={styles.blockLabel}>Your review of {them}</span>
            <Stars value={my_review.rating} />
          </div>
          {my_review.comment ? <p className={styles.comment}>“{my_review.comment}”</p> : null}
          <span className={styles.date}>Submitted {formatDate(my_review.created_at)}</span>
        </div>
      ) : (
        <>
          <p className={styles.sub}>
            How was your time with {them}? Your rating and note show on their profile, and reviews
            are always two-way — they can review you too.
          </p>
          <div
            className={styles.picker}
            role="radiogroup"
            aria-label="Star rating"
            onMouseLeave={() => setHover(0)}
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={rating === n}
                aria-label={`${n} star${n === 1 ? '' : 's'}`}
                className={`${styles.pickerBtn} ${n <= shown ? styles.pickerOn : ''}`}
                onMouseEnter={() => setHover(n)}
                onClick={() => setRating(n)}
              >
                ★
              </button>
            ))}
          </div>
          <textarea
            className={styles.textarea}
            placeholder={`Share a little about your experience with ${them} (optional)`}
            maxLength={2000}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <div className={styles.submitRow}>
            <Button
              variant="primary"
              loading={submitting}
              disabled={submitting}
              onClick={() => void submit()}
            >
              Submit review
            </Button>
          </div>
          {submitError ? <StatusMessage tone="error">{submitError}</StatusMessage> : null}
        </>
      )}

      <div className={styles.divider} />

      {their_review ? (
        <div className={styles.block}>
          <div className={styles.blockHead}>
            <span className={styles.blockLabel}>{them}’s review of you</span>
            <Stars value={their_review.rating} />
          </div>
          {their_review.comment ? <p className={styles.comment}>“{their_review.comment}”</p> : null}
          <span className={styles.date}>{formatDate(their_review.created_at)}</span>
        </div>
      ) : (
        <p className={styles.muted}>{them} hasn’t left a review yet.</p>
      )}
    </section>
  );
}
