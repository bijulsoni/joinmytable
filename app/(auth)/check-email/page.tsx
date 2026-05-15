import type { Metadata } from 'next';
import Link from 'next/link';
import styles from '../styles.module.css';

export const metadata: Metadata = {
  title: 'Check your email',
};

// Sign-up landing when Supabase Auth is configured to require email
// confirmation. The user follows the link in the email; the /callback
// route handler exchanges it for a session.
export default function CheckEmailPage() {
  return (
    <div className={styles.card}>
      <h1 className={styles.heading}>Check your email</h1>
      <p className={styles.subheading}>
        We&apos;ve sent you a confirmation link. Open it on this device to finish
        signing in.
      </p>
      <div className={styles.linkRow}>
        <Link href="/login">Back to sign in</Link>
      </div>
    </div>
  );
}
