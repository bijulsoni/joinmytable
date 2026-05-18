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
        <label htmlFor="legalName" className={styles.label}>
          Full legal name (as on your ID)
        </label>
        <input
          id="legalName"
          name="legalName"
          type="text"
          required
          maxLength={200}
          autoComplete="name"
          className={styles.input}
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="document" className={styles.label}>
          Photo of your government-issued ID
        </label>
        <input
          id="document"
          name="document"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          required
          className={styles.input}
        />
        <p className={styles.helpText}>
          JPG, PNG, WEBP, or HEIC. Up to 10 MB. Stored privately - only the review team can see it.
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
