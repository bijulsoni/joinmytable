'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import { forgotPasswordAction, type ForgotState } from './actions';
import styles from '../styles.module.css';

const INITIAL: ForgotState = { status: 'idle' };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={styles.primary} disabled={pending}>
      {pending ? 'Sending...' : 'Send reset link'}
    </button>
  );
}

export function ForgotForm() {
  const [state, formAction] = useActionState(forgotPasswordAction, INITIAL);

  if (state.status === 'sent') {
    return (
      <div className={styles.notice} role="status">
        If an account exists for that email, a password reset link is on its way.
        <div className={styles.linkRow}>
          <Link href="/login">Back to sign in</Link>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className={styles.form} noValidate>
      <div className={styles.field}>
        <label htmlFor="email" className={styles.label}>
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          className={styles.input}
        />
      </div>
      {state.status === 'error' && (
        <div className={styles.error} role="alert">
          {state.message}
        </div>
      )}
      <SubmitButton />
      <div className={styles.linkRow}>
        <Link href="/login">Back to sign in</Link>
      </div>
    </form>
  );
}
