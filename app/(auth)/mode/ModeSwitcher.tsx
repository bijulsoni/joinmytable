'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { setModesAction, type ModeState } from './actions';
import styles from '../styles.module.css';

const INITIAL: ModeState = { status: 'idle' };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={styles.secondary} disabled={pending}>
      {pending ? 'Saving...' : 'Save modes'}
    </button>
  );
}

export interface ModeSwitcherProps {
  initialIsSeeker: boolean;
  initialIsCompanion: boolean;
}

export function ModeSwitcher({
  initialIsSeeker,
  initialIsCompanion,
}: ModeSwitcherProps) {
  const [state, formAction] = useFormState(setModesAction, INITIAL);

  return (
    <form action={formAction} className={styles.form} noValidate>
      <div className={styles.modeRow}>
        <strong className={styles.label}>Active modes</strong>
        <label className={styles.checkboxRow}>
          <input
            type="checkbox"
            name="isSeeker"
            defaultChecked={initialIsSeeker}
          />
          Seeker - request meals with companions.
        </label>
        <label className={styles.checkboxRow}>
          <input
            type="checkbox"
            name="isCompanion"
            defaultChecked={initialIsCompanion}
          />
          Companion - be matched with seekers.
        </label>
        <p className={styles.helpText}>
          One account, two modes - you can run as both.
        </p>
      </div>
      {state.status === 'error' && (
        <div className={styles.error} role="alert">
          {state.message}
        </div>
      )}
      {state.status === 'ok' && (
        <div className={styles.success} role="status">
          Saved.
        </div>
      )}
      <SubmitButton />
    </form>
  );
}
