'use client';

// "Report an issue" dialog. Mounted by UserMenu when the user opens it.
//
// Lives outside the menu's popover so closing the menu doesn't dismiss
// the dialog mid-typing. State is local — submit posts to /api/feedback
// then closes with a thank-you toast.

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import styles from './ReportIssueDialog.module.css';

type Category = 'bug' | 'idea' | 'complaint' | 'other';

interface Props {
  open: boolean;
  onClose: () => void;
}

const CATEGORY_LABELS: Record<Category, string> = {
  bug: '🐞  Something’s broken',
  idea: '💡  I’ve got an idea',
  complaint: '😕  Something feels off',
  other: '💬  Just sharing',
};

export function ReportIssueDialog({ open, onClose }: Props) {
  const [category, setCategory] = useState<Category>('bug');
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<
    { state: 'idle' } | { state: 'error'; message: string } | { state: 'ok' }
  >({ state: 'idle' });

  // ESC closes; reset state on close.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) return;
    // Reset after the dialog closes so the next open is a clean slate.
    const t = window.setTimeout(() => {
      setCategory('bug');
      setBody('');
      setStatus({ state: 'idle' });
      setSubmitting(false);
    }, 300);
    return () => window.clearTimeout(t);
  }, [open]);

  const onSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!body.trim()) {
        setStatus({ state: 'error', message: 'Add a line or two so we know what’s up.' });
        return;
      }
      setSubmitting(true);
      setStatus({ state: 'idle' });
      try {
        const res = await fetch('/api/feedback', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            category,
            body: body.trim(),
            url:
              typeof window === 'undefined'
                ? null
                : window.location.pathname + window.location.search,
          }),
        });
        if (!res.ok) {
          const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
          throw new Error(json.error?.message ?? `Could not send (${res.status}).`);
        }
        setStatus({ state: 'ok' });
        window.setTimeout(onClose, 1200);
      } catch (err) {
        setStatus({ state: 'error', message: err instanceof Error ? err.message : 'Send failed.' });
      } finally {
        setSubmitting(false);
      }
    },
    [body, category, onClose],
  );

  if (!open) return null;

  return (
    <div
      className={styles.scrim}
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-issue-heading"
    >
      <button
        type="button"
        className={styles.scrimDismiss}
        onClick={onClose}
        aria-label="Close"
        tabIndex={-1}
      />
      <div className={styles.panel}>
        <header className={styles.header}>
          <h2 id="report-issue-heading" className={styles.title}>
            Tell us what&apos;s up
          </h2>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <form className={styles.form} onSubmit={onSubmit}>
          <div className={styles.categoryGrid} role="radiogroup" aria-label="Category">
            {(Object.keys(CATEGORY_LABELS) as Category[]).map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={category === c}
                className={`${styles.category} ${category === c ? styles.categoryActive : ''}`}
                onClick={() => setCategory(c)}
              >
                {CATEGORY_LABELS[c]}
              </button>
            ))}
          </div>

          <label className={styles.label} htmlFor="feedback-body">
            What happened?
          </label>
          <textarea
            id="feedback-body"
            className={styles.textarea}
            rows={5}
            maxLength={4000}
            placeholder="As much detail as you can — what you were trying to do, what went wrong, what you saw."
            value={body}
            onChange={(e) => setBody(e.target.value)}
            disabled={submitting}
            autoFocus
          />

          {status.state === 'error' ? <p className={styles.error}>{status.message}</p> : null}
          {status.state === 'ok' ? <p className={styles.ok}>Thanks — we’ve got it. ✨</p> : null}

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.secondary}
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button type="submit" className={styles.primary} disabled={submitting || !body.trim()}>
              {submitting ? 'Sending…' : 'Send'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
