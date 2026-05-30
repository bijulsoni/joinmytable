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
import shared from '../styles.module.css';
import styles from './styles.module.css';

// Production base URL — this literal is intentional (share links must be
// absolute and point at prod, never a preview/localhost host).
const BASE_URL = 'https://www.konnly.com';

function signupUrl(code: string): string {
  return `${BASE_URL}/sign-up?invite=${code}`;
}

// "Unlimited" maps to null max_uses; everything else is a positive cap.
const MAX_USES_OPTIONS: { label: string; value: string }[] = [
  { label: 'Single use', value: '1' },
  { label: '10 uses', value: '10' },
  { label: '25 uses', value: '25' },
  { label: '50 uses', value: '50' },
  { label: '100 uses', value: '100' },
  { label: 'Unlimited', value: 'unlimited' },
];

interface ShareVariant {
  key: string;
  label: string;
  build: (url: string) => string;
}

// Warm, honest, beta-flavored copy. Each variant includes the invite URL.
const SHARE_VARIANTS: ShareVariant[] = [
  {
    key: 'short',
    label: 'Short (X / Twitter)',
    build: (url) =>
      `Coffee or a meal with someone new? I'm beta-testing Konnly — it matches you ` +
      `with friendly, verified people for coffee, lunch, happy hour, or dinner. ` +
      `Real plans, no swiping. Join with my invite: ${url}`,
  },
  {
    key: 'instagram',
    label: 'Instagram bio / DM',
    build: (url) =>
      `Trying something new ☕🍽️\n\n` +
      `Konnly is a small Pacific-Northwest beta that matches you with friendly, ` +
      `verified people for coffee, lunch, happy hour, or dinner. Real plans in real ` +
      `places — no swiping, no games.\n\n` +
      `Come try it with me 👇\n${url}`,
  },
  {
    key: 'facebook',
    label: 'Facebook / longer post',
    build: (url) =>
      `Want to grab coffee or a meal with someone new?\n\n` +
      `I've been testing Konnly — a small Pacific-Northwest beta that matches you ` +
      `with friendly, verified people for coffee, lunch, happy hour, or dinner. ` +
      `Everything happens in public spots like cafés and restaurants, everyone's ` +
      `verified, and it's honestly just a nice, low-pressure way to meet people over ` +
      `a real plan instead of endless swiping.\n\n` +
      `It's invite-only while in beta. If you'd like to try it, join with my invite ` +
      `link here:\n${url}`,
  },
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
            <NewCode key={code} code={code} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

// One freshly-minted code with its three copy-pasteable share variants.
function NewCode({ code }: { code: string }) {
  const url = signupUrl(code);
  return (
    <div className={styles.codeBlock}>
      <div className={styles.codeHead}>
        <span className={styles.codeValue}>{code}</span>
        <CopyButton text={url} label="Copy link" />
      </div>
      <div className={styles.variants}>
        {SHARE_VARIANTS.map((v) => {
          const message = v.build(url);
          return (
            <div key={v.key} className={styles.variant}>
              <div className={styles.variantHead}>
                <span className={styles.variantLabel}>{v.label}</span>
                <CopyButton text={message} label="Copy" />
              </div>
              <p className={styles.shareBox}>{message}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Copy-to-clipboard button with a transient "Copied!" confirmation.
function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked (e.g. insecure context). Leave the message
      // visible so the admin can select + copy it by hand.
      setCopied(false);
    }
  }, [text]);

  return (
    <button
      type="button"
      className={`${shared.btn} ${shared.btnGhost} ${styles.copyBtn}`}
      onClick={() => void onCopy()}
      aria-live="polite"
    >
      {copied ? 'Copied!' : label}
    </button>
  );
}
