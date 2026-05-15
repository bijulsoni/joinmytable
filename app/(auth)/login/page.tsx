import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { LoginForm } from './LoginForm';
import styles from '../styles.module.css';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to JoinMyTable.',
};

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect('/');

  return (
    <div className={styles.card}>
      <h1 className={styles.heading}>Welcome back</h1>
      <p className={styles.subheading}>Sign in to plan your next meal.</p>
      <LoginForm />
    </div>
  );
}
