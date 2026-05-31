import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { SignUpForm } from './SignUpForm';
import styles from '../styles.module.css';

export const metadata: Metadata = {
  title: 'Create your account',
  description: 'Sign up for Konnly to share a lunch or dinner.',
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
      <p className={styles.tagline}>The more AI does, the more human you get to be.</p>
      <p className={styles.subheading}>
        Konnly is in private beta, open in the Seattle–Bellevue area. Elsewhere? Sign up and
        we&apos;ll waitlist you for your city.
      </p>
      <SignUpForm />
    </div>
  );
}
