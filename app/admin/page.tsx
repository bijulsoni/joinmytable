import type { Metadata } from 'next';
import Link from 'next/link';
import { authAdminClient } from '@/lib/auth/db';
import styles from './styles.module.css';

export const metadata: Metadata = { title: 'Admin dashboard' };

// Force fresh counts on every visit — admin is low-traffic and stale
// numbers here are confusing.
export const dynamic = 'force-dynamic';

export default async function AdminDashboard() {
  const admin = authAdminClient();

  // Run the counts concurrently.
  const [
    pendingVerifications,
    totalFeedback,
    totalUsers,
    redemptions,
    inviteCodes,
    waitlist,
    activeBookings,
  ] = await Promise.all([
    admin
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('verification_status', 'pending')
      .then((r) => r.count ?? 0),
    admin
      .from('feedback_reports')
      .select('id', { count: 'exact', head: true })
      .then((r) => r.count ?? 0),
    admin
      .from('users')
      .select('id', { count: 'exact', head: true })
      .then((r) => r.count ?? 0),
    admin
      .from('invite_redemptions')
      .select('id', { count: 'exact', head: true })
      .then((r) => r.count ?? 0),
    admin
      .from('invite_codes')
      .select('id', { count: 'exact', head: true })
      .then((r) => r.count ?? 0),
    admin
      .from('waitlist')
      .select('id', { count: 'exact', head: true })
      .then((r) => r.count ?? 0),
    admin
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'completed')
      .then((r) => r.count ?? 0),
  ]);

  const cards = [
    {
      href: '/admin/verifications',
      label: 'Pending verifications',
      value: pendingVerifications,
      hint: pendingVerifications > 0 ? 'Needs your review' : 'All clear',
      urgent: pendingVerifications > 0,
    },
    {
      href: '/admin/feedback',
      label: 'Feedback reports',
      value: totalFeedback,
      hint: 'From the in-app reporter',
    },
    {
      href: '/admin/invites',
      label: 'Invite codes',
      value: inviteCodes,
      hint: `${redemptions} sign-up${redemptions === 1 ? '' : 's'} attributed`,
    },
    {
      href: '/admin/invites',
      label: 'Total members',
      value: totalUsers,
      hint: 'All registered accounts',
    },
    {
      href: '/admin/bookings',
      label: 'Completed meets',
      value: activeBookings,
      hint: activeBookings > 0 ? 'May need payouts' : 'No meets yet',
      urgent: activeBookings > 0,
    },
    {
      href: '/admin/waitlist',
      label: 'Waitlist',
      value: waitlist,
      hint: 'Out-of-region — next-region signal',
    },
  ];

  return (
    <div className={styles.page}>
      <h1 className={styles.h1}>Dashboard</h1>
      <p className={styles.lede}>Everything you need to run the beta, in one place.</p>

      <div className={styles.statGrid}>
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className={`${styles.statCard} ${c.urgent ? styles.statCardUrgent : ''}`}
          >
            <span className={styles.statValue}>{c.value}</span>
            <span className={styles.statLabel}>{c.label}</span>
            <span className={styles.statHint}>{c.hint}</span>
          </Link>
        ))}
      </div>

      <div className={styles.quickLinks}>
        <h2 className={styles.h2}>Quick actions</h2>
        <div className={styles.quickRow}>
          <Link href="/admin/invites" className={styles.quickLink}>
            <span aria-hidden>🎟️</span> Mint an invite code
          </Link>
          <Link href="/admin/verifications" className={styles.quickLink}>
            <span aria-hidden>🪪</span> Review verifications
          </Link>
          <Link href="/admin/feedback" className={styles.quickLink}>
            <span aria-hidden>💬</span> Read feedback
          </Link>
        </div>
      </div>
    </div>
  );
}
