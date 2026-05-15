import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { ResetForm } from './ResetForm';
import styles from '../styles.module.css';

export const metadata: Metadata = {
  title: 'Set a new password',
};

export default async function ResetPasswordPage() {
  const user = await getSessionUser();
  if (!user) {
    // The reset link establishes the session via /callback. If we got
    // here without one, send the user back to start.
    redirect('/forgot-password');
  }

  return (
    <div className={styles.card}>
      <h1 className={styles.heading}>Set a new password</h1>
      <p className={styles.subheading}>
        Choose a fresh password. You&apos;ll be signed in afterwards.
      </p>
      <ResetForm />
    </div>
  );
}
