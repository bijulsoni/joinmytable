import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAdmin } from '@/lib/auth/admin';
import styles from './styles.module.css';

export const metadata: Metadata = {
  title: 'Admin',
  robots: { index: false, follow: false },
};

// Admin console shell. requireAdmin() gates every /admin/* route here in
// the layout — a non-admin never renders any admin page. The nav is a
// plain server-rendered set of links; admin is low-traffic and doesn't
// need client-side routing flourishes.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.topbarInner}>
          <Link href="/admin" className={styles.brand}>
            <span className={styles.brandMark}>◖</span>
            Konnly <span className={styles.brandTag}>Admin</span>
          </Link>
          <nav className={styles.nav} aria-label="Admin">
            <Link href="/admin" className={styles.navLink}>
              Dashboard
            </Link>
            <Link href="/admin/invites" className={styles.navLink}>
              Invites
            </Link>
            <Link href="/admin/feedback" className={styles.navLink}>
              Feedback
            </Link>
            <Link href="/admin/verifications" className={styles.navLink}>
              Verifications
            </Link>
            <Link href="/admin/waitlist" className={styles.navLink}>
              Waitlist
            </Link>
          </nav>
          <div className={styles.topbarRight}>
            <span className={styles.adminEmail}>{user.email}</span>
            <Link href="/discover" className={styles.backToApp}>
              ← Back to app
            </Link>
          </div>
        </div>
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
