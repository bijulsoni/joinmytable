'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { resetPasswordAction, type ResetState } from './actions';
import styles from '../styles.module.css';

const INITIAL: ResetState = { status: 'idle' };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={styles.primary} disabled={pending}>
      {pending ? 'Updating...' : 'Set new password'}
    </button>
  );
}

export function ResetForm() {
  const [state, formAction] = useFormState(resetPasswordAction, INITIAL);

  return (
    <form action={formAction} className={styles.form} noValidate>
      <div className={styles.field}>
        <label htmlFor="password" className={styles.label}>
          New password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={72}
          className={styles.input}
        />
      </div>
      <div className={styles.field}>
        <label htmlFor="confirm" className={styles.label}>
          Confirm password
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={72}
          className={styles.input}
        />
      </div>
      {state.status === 'error' && (
        <div className={styles.error} role="alert">
          {state.message}
        </div>
      )}
      <SubmitButton />
    </form>
  );
}
