import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { SignUpForm } from './SignUpForm';
import styles from '../styles.module.css';

export const metadata: Metadata = {
  title: 'Create your account',
  description: 'Sign up for JoinMyTable to share a lunch or dinner.',
};

// Sign-up - "screen 1" in the wireframe. Email + password, mode select,
// guidelines acceptance. Already-signed-in visitors get bounced.
export default async function SignUpPage() {
  const user = await getSessionUser();
  if (user) {
    redirect('/');
  }

  return (
    <div className={styles.card}>
      <h1 className={styles.heading}>Create your account</h1>
      <p className={styles.subheading}>
        Pick how you&apos;d like to use JoinMyTable. You can do both.
      </p>
      <SignUpForm />
    </div>
  );
}
