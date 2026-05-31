'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { submitCompanionVerificationAction, type CompanionVerifyState } from './actions';
import styles from '../../styles.module.css';

const INITIAL: CompanionVerifyState = { status: 'idle' };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={styles.primary} disabled={pending}>
      {pending ? 'Submitting...' : 'Submit for review'}
    </button>
  );
}

export function CompanionVerifyForm() {
  const [state, formAction] = useActionState(submitCompanionVerificationAction, INITIAL);

  return (
    <form action={formAction} className={styles.form} noValidate encType="multipart/form-data">
      <div className={styles.field}>
        <label htmlFor="selfie" className={styles.label}>
          Selfie <span aria-hidden>·</span> required
        </label>
        <input
          id="selfie"
          name="selfie"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          capture="user"
          required
          className={styles.input}
        />
        <p className={styles.helpText}>
          This is all we need to get you into Explore. On phone it opens your front camera. Stored
          privately — only the review team sees it.
        </p>
      </div>

      <div className={styles.field}>
        <label htmlFor="legalName" className={styles.label}>
          Full legal name (optional — for ID step)
        </label>
        <input
          id="legalName"
          name="legalName"
          type="text"
          maxLength={200}
          autoComplete="name"
          className={styles.input}
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="document" className={styles.label}>
          Photo of your government-issued ID <span aria-hidden>·</span> optional now
        </label>
        <input
          id="document"
          name="document"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          capture="environment"
          className={styles.input}
        />
        <p className={styles.helpText}>
          Add it now to get fully verified faster, or later — you&apos;ll be asked for it when you
          accept your first request to confirm a meet. Driver&apos;s license, passport, or state ID.
          Stored privately.
        </p>
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
