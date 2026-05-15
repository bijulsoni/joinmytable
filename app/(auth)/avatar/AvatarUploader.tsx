'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { uploadAvatarAction, type AvatarState } from './actions';
import styles from '../styles.module.css';

const INITIAL: AvatarState = { status: 'idle' };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={styles.secondary} disabled={pending}>
      {pending ? 'Uploading...' : 'Upload photo'}
    </button>
  );
}

export interface AvatarUploaderProps {
  currentAvatarUrl: string | null;
}

export function AvatarUploader({ currentAvatarUrl }: AvatarUploaderProps) {
  const [state, formAction] = useFormState(uploadAvatarAction, INITIAL);

  return (
    <form
      action={formAction}
      className={styles.form}
      encType="multipart/form-data"
      noValidate
    >
      {currentAvatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={currentAvatarUrl}
          alt="Current profile photo"
          width={96}
          height={96}
          style={{
            width: 96,
            height: 96,
            borderRadius: '50%',
            objectFit: 'cover',
            border: '1px solid #ececec',
          }}
        />
      ) : (
        <p className={styles.helpText}>No photo yet.</p>
      )}

      <div className={styles.field}>
        <label htmlFor="avatar" className={styles.label}>
          Profile photo
        </label>
        <input
          id="avatar"
          name="avatar"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          required
          className={styles.input}
        />
        <p className={styles.helpText}>JPG, PNG, WEBP, or HEIC. Up to 5 MB.</p>
      </div>

      {state.status === 'error' && (
        <div className={styles.error} role="alert">
          {state.message}
        </div>
      )}
      {state.status === 'ok' && (
        <div className={styles.success} role="status">
          Photo updated.
        </div>
      )}

      <SubmitButton />
    </form>
  );
}
