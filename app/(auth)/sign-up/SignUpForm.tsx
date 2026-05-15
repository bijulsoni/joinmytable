'use client';

import { useFormState, useFormStatus } from 'react-dom';
import Link from 'next/link';
import { signUpAction, type SignUpState } from './actions';
import styles from '../styles.module.css';

const INITIAL: SignUpState = { status: 'idle' };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={styles.primary} disabled={pending}>
      {pending ? 'Creating account...' : 'Create account'}
    </button>
  );
}

export function SignUpForm() {
  const [state, formAction] = useFormState(signUpAction, INITIAL);

  return (
    <form action={formAction} className={styles.form} noValidate>
      <div className={styles.field}>
        <label htmlFor="displayName" className={styles.label}>
          Display name
        </label>
        <input
          id="displayName"
          name="displayName"
          type="text"
          autoComplete="name"
          required
          maxLength={80}
          className={styles.input}
        />
      </div>

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

      <div className={styles.field}>
        <label htmlFor="password" className={styles.label}>
          Password
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
        <p className={styles.helpText}>At least 8 characters.</p>
      </div>

      <div className={styles.modeRow}>
        <strong className={styles.label}>How do you want to use JoinMyTable?</strong>
        <label className={styles.checkboxRow}>
          <input
            type="checkbox"
            name="isSeeker"
            defaultChecked
          />
          I&apos;m a seeker - I&apos;d like to share meals with companions.
        </label>
        <label className={styles.checkboxRow}>
          <input type="checkbox" name="isCompanion" />
          I&apos;m a companion - I&apos;d like to be matched with seekers.
        </label>
        <p className={styles.helpText}>
          One account, two modes - you can change this any time.
        </p>
      </div>

      <label className={styles.checkboxRow}>
        <input type="checkbox" name="acceptGuidelines" required />
        I&apos;ve read and accept the community guidelines.
      </label>

      {state.status === 'error' && (
        <div className={styles.error} role="alert">
          {state.message}
        </div>
      )}

      <SubmitButton />

      <div className={styles.linkRow}>
        Already have an account? <Link href="/login">Sign in</Link>
      </div>
    </form>
  );
}
