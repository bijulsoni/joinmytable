import type { Metadata } from 'next';
import { ForgotForm } from './ForgotForm';
import styles from '../styles.module.css';

export const metadata: Metadata = {
  title: 'Forgot password',
};

export default function ForgotPasswordPage() {
  return (
    <div className={styles.card}>
      <h1 className={styles.heading}>Forgot your password?</h1>
      <p className={styles.subheading}>
        Enter your email and we&apos;ll send you a reset link.
      </p>
      <ForgotForm />
    </div>
  );
}
