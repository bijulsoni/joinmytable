'use client';

// Mint-invite form + share-message generator.
//
// Mints one-or-many invite codes via the mintCodesAction server action,
// then for each new code renders three ready-to-paste sign-up messages
// (X/Twitter, Instagram, Facebook) each carrying the full invite URL —
// so an admin can mint a channel code and copy a matching post in one go.
//
// React 19 pattern: a plain useTransition wrapping the action call (the
// action takes a typed object, not FormData, so useActionState's
// FormData signature doesn't fit cleanly here — same shape as
// WelcomeForm.tsx).

import { useCallback, useState, useTransition, type FormEvent } from 'react';
import { mintCodesAction } from './actions';
import { ShareMessages } from './ShareMessages';
import shared from '../styles.module.css';
import styles from './styles.module.css';

// "Unlimited" maps to null max_uses; everything else is a positive cap.
const MAX_USES_OPTIONS: { label: string; value: string }[] = [
  { label: 'Single use', value: '1' },
  { label: '10 uses', value: '10' },
  { label: '25 uses', value: '25' },
  { label: '50 uses', value: '50' },
  { label: '100 uses', value: '100' },
  { label: 'Unlimited', value: 'unlimited' },
];

interface FormValues {
  note: string;
  maxUses: string;
  expiresDays: string;
  count: string;
}

const BLANK: FormValues = { note: '', maxUses: '1', expiresDays: '', count: '1' };

export function MintInviteForm() {
  const [form, setForm] = useState<FormValues>(BLANK);
  const [error, setError] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();

  const onSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setError(null);

      const count = Number(form.count);
      if (!Number.isInteger(count) || count < 1 || count > 50) {
        setError('Count must be a whole number between 1 and 50.');
        return;
      }

      const maxUses = form.maxUses === 'unlimited' ? null : Number(form.maxUses);
      if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1)) {
        setError('Pick a valid max-uses option.');
        return;
      }

      let expiresDays: number | null = null;
      if (form.expiresDays.trim() !== '') {
        const n = Number(form.expiresDays);
        if (!Number.isInteger(n) || n < 1) {
          setError('Expires-in days must be a positive whole number, or left blank.');
          return;
        }
        expiresDays = n;
      }

      startTransition(async () => {
        const result = await mintCodesAction({
          note: form.note.trim() || undefined,
          maxUses,
          expiresDays,
          count,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setCodes(result.codes);
      });
    },
    [form],
  );

  return (
    <div className={shared.card}>
      <h2 className={shared.h2}>Mint invite codes</h2>

      <form onSubmit={onSubmit}>
        <div className={styles.formGrid}>
          <div className={shared.field}>
            <label htmlFor="note" className={shared.label}>
              Channel / note
            </label>
            <input
              id="note"
              name="note"
              type="text"
              maxLength={200}
              autoComplete="off"
              placeholder="e.g. facebook-jan2027"
              className={shared.input}
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
            <p className={shared.help}>Labels the code for attribution. Optional.</p>
          </div>

          <div className={shared.field}>
            <label htmlFor="maxUses" className={shared.label}>
              Max uses
            </label>
            <select
              id="maxUses"
              name="maxUses"
              className={shared.select}
              value={form.maxUses}
              onChange={(e) => setForm({ ...form, maxUses: e.target.value })}
            >
              {MAX_USES_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <p className={shared.help}>Unlimited never runs out — good for channel codes.</p>
          </div>

          <div className={shared.field}>
            <label htmlFor="expiresDays" className={shared.label}>
              Expires in (days)
            </label>
            <input
              id="expiresDays"
              name="expiresDays"
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              placeholder="never"
              className={shared.input}
              value={form.expiresDays}
              onChange={(e) => setForm({ ...form, expiresDays: e.target.value })}
            />
            <p className={shared.help}>Leave blank for no expiry.</p>
          </div>

          <div className={shared.field}>
            <label htmlFor="count" className={shared.label}>
              How many
            </label>
            <input
              id="count"
              name="count"
              type="number"
              min={1}
              max={50}
              step={1}
              inputMode="numeric"
              className={shared.input}
              value={form.count}
              onChange={(e) => setForm({ ...form, count: e.target.value })}
            />
            <p className={shared.help}>1–50 at a time.</p>
          </div>
        </div>

        {error ? (
          <p className={shared.error} role="alert">
            {error}
          </p>
        ) : null}

        <div className={styles.formActions}>
          <button
            type="submit"
            className={`${shared.btn} ${shared.btnPrimary}`}
            disabled={isPending}
          >
            {isPending ? 'Minting…' : 'Mint codes'}
          </button>
          {codes.length > 0 ? (
            <span className={shared.ok}>
              ✓ Minted {codes.length} code{codes.length === 1 ? '' : 's'}.
            </span>
          ) : null}
        </div>
      </form>

      {codes.length > 0 ? (
        <div className={styles.results}>
          <p className={styles.resultsHead}>
            Fresh codes — copy a sign-up message for the channel you&apos;re posting to.
          </p>
          {codes.map((code) => (
            <ShareMessages key={code} code={code} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
