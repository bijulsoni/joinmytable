// Text input with built-in label, help text, and error state. Wraps a
// single <input> so callers can still pass arbitrary native props (type,
// inputMode, autoComplete, etc.) without us mediating each one.

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import styles from './Input.module.css';

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: ReactNode;
  /** When true the label is followed by a muted "(optional)" hint. */
  optional?: boolean;
  /** Always-visible help text below the input. */
  help?: ReactNode;
  /** Error message — when present sets aria-invalid + role=alert. */
  error?: string | null;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, optional, help, error, className, ...rest },
  ref,
) {
  const fieldId = useId();
  const errorId = error ? `${fieldId}-error` : undefined;
  const helpId = help ? `${fieldId}-help` : undefined;
  const describedBy = [errorId, helpId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={styles.field}>
      <label htmlFor={fieldId} className={styles.label}>
        {label}
        {optional ? <span className={styles.optional}>(optional)</span> : null}
      </label>
      <input
        ref={ref}
        id={fieldId}
        className={[styles.control, className ?? ''].filter(Boolean).join(' ')}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...rest}
      />
      {help && !error ? (
        <p id={helpId} className={styles.help}>
          {help}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
});

interface TextareaProps extends Omit<InputHTMLAttributes<HTMLTextAreaElement>, 'id'> {
  label: ReactNode;
  optional?: boolean;
  help?: ReactNode;
  error?: string | null;
  rows?: number;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, optional, help, error, className, rows = 4, ...rest },
  ref,
) {
  const fieldId = useId();
  const errorId = error ? `${fieldId}-error` : undefined;
  const helpId = help ? `${fieldId}-help` : undefined;
  const describedBy = [errorId, helpId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={styles.field}>
      <label htmlFor={fieldId} className={styles.label}>
        {label}
        {optional ? <span className={styles.optional}>(optional)</span> : null}
      </label>
      <textarea
        ref={ref}
        id={fieldId}
        rows={rows}
        className={[styles.control, styles.textarea, className ?? ''].filter(Boolean).join(' ')}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...rest}
      />
      {help && !error ? (
        <p id={helpId} className={styles.help}>
          {help}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
});
