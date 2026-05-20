'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
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
  const [state, formAction] = useActionState(signUpAction, INITIAL);

  return (
    <form action={formAction} className={styles.form} noValidate>
      <div className={styles.field}>
        <label htmlFor="name" className={styles.label}>
          Name
        </label>
        <input
          id="name"
          name="name"
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

      <div className={styles.field}>
        <label htmlFor="inviteCode" className={styles.label}>
          Invite code
        </label>
        <input
          id="inviteCode"
          name="inviteCode"
          type="text"
          required
          maxLength={40}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="TABLE-XXXX-XX"
          className={styles.input}
          style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}
        />
        <p className={styles.helpText}>
          JoinMyTable is in private beta. Ask whoever invited you for a code.
        </p>
      </div>

      <label className={styles.checkboxRow}>
        <input type="checkbox" name="acceptGuidelines" required />
        I&apos;ve read and accept the community guidelines.
      </label>
      <p className={styles.helpText}>
        Want to be paid to share a meal as a companion? You can set that up from your profile after
        sign-up.
      </p>

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
