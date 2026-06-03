import type { Metadata } from 'next';
import Link from 'next/link';
import { AppShell } from '@/components/app';
import { requireSessionUser } from '@/lib/auth/session';
import { ReviewSection } from '@/components/review/ReviewSection';
import styles from './styles.module.css';

export const metadata: Metadata = {
  title: 'Leave a review',
};

interface RouteContext {
  params: Promise<{ id: string }>;
}

// /bookings/[id]/review — the landing page for the "Leave a review" CTA
// in the review-prompt email. The ReviewSection client component fetches
// the booking's review state and renders the two-way form (or read-only
// state if already submitted). Reviews are gated to completed bookings
// and to participants by RLS; a non-participant simply sees an error.
export default async function BookingReviewPage(ctx: RouteContext) {
  const { id } = await ctx.params;
  // Redirects to login internally when signed out.
  await requireSessionUser(`/login?next=/bookings/${id}/review`);

  return (
    <AppShell loginRedirectTo={`/bookings/${id}/review`}>
      <main className={styles.shell}>
        <header className={styles.header}>
          <Link href="/bookings" className={styles.back}>
            ‹ Back to bookings
          </Link>
        </header>
        <ReviewSection bookingId={id} />
      </main>
    </AppShell>
  );
}
