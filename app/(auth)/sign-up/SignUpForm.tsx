'use client';

import { Suspense, useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { signUpAction, type SignUpState } from './actions';
import { GoogleButton } from '../GoogleButton';
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

// Reads ?invite=CODE from the URL. When present we render the invite
// field as a hidden input pre-filled with the param — channel-marketing
// links like /sign-up?invite=TABLE-FB-XXXX skip the manual code step.
// Wrapped in <Suspense> because useSearchParams() needs a boundary in
// Next 15 App Router.
function InviteField() {
  const search = useSearchParams();
  const fromUrl = search.get('invite')?.trim();

  if (fromUrl) {
    return (
      <input
        type="hidden"
        name="inviteCode"
        value={fromUrl}
        // The server action uppercases + trims; we pre-clean here too
        // so the hidden value matches what the user would have typed.
        // Field stays in the form so the existing validation/claim flow
        // is unchanged — it just doesn't render visibly.
      />
    );
  }

  return (
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
        Konnly is in private beta. Ask whoever invited you for a code.
      </p>
    </div>
  );
}

// Surfaces the reason a Google sign-up bounced back from /callback. The
// callback enforces the invite gate for brand-new OAuth users and
// redirects here with ?oauth=<reason> on failure.
const OAUTH_MESSAGES: Record<string, string> = {
  invite_required: 'You need an invite code to join the beta. Enter it below, then continue.',
  invite_invalid: 'That invite code isn’t valid. Check it and try again.',
  invite_taken: 'That invite code was just fully used. Try a different one.',
  mirror_failed: 'Something went wrong setting up your account. Please try again.',
};

function OAuthNotice() {
  const search = useSearchParams();
  const reason = search.get('oauth');
  if (!reason) return null;
  const message = OAUTH_MESSAGES[reason] ?? 'Google sign-in didn’t complete. Please try again.';
  return (
    <div className={styles.error} role="alert">
      {message}
    </div>
  );
}

export function SignUpForm() {
  const [state, formAction] = useActionState(signUpAction, INITIAL);

  return (
    <form action={formAction} className={styles.form} noValidate>
      <Suspense fallback={null}>
        <OAuthNotice />
      </Suspense>
      <GoogleButton mode="sign-up" />
      <div className={styles.oauthDivider}>or sign up with email</div>

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

      <Suspense
        fallback={
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
          </div>
        }
      >
        <InviteField />
      </Suspense>

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
