'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { submitCompanionVerificationAction, type CompanionVerifyState } from './actions';
import styles from '../../styles.module.css';

const INITIAL: CompanionVerifyState = { status: 'idle' };

// Downscale an image File to a modest JPEG before upload. Phone selfies
// are often 3–8MB — bigger than the serverless request-body ceiling — so
// we shrink to <=1600px / quality 0.82 (typically a few hundred KB). If
// the browser can't decode the image (rare; some HEIC on non-Safari),
// we fall back to the original file and let the raised body limit handle it.
async function downscaleImage(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const maxDim = 1600;
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.82),
    );
    return blob ?? file;
  } catch {
    return file;
  }
}

export function CompanionVerifyForm() {
  const [error, setError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;

    const selfieFile =
      (form.elements.namedItem('selfie') as HTMLInputElement | null)?.files?.[0] ?? null;
    if (!selfieFile) {
      setError('A selfie is required to get into Explore.');
      return;
    }

    // Build the FormData (incl. async image downscaling) BEFORE the
    // transition, then call the server action directly inside it. The
    // action redirect()s on success → clean navigation; on failure it
    // returns { status: 'error' }.
    setPreparing(true);
    let fd: FormData;
    try {
      fd = new FormData();
      fd.set('payoutMethod', (form.elements.namedItem('payoutMethod') as HTMLSelectElement).value);
      fd.set('payoutHandle', (form.elements.namedItem('payoutHandle') as HTMLInputElement).value);
      fd.set('legalName', (form.elements.namedItem('legalName') as HTMLInputElement).value);
      fd.set('selfie', await downscaleImage(selfieFile), 'selfie.jpg');
      const docFile =
        (form.elements.namedItem('document') as HTMLInputElement | null)?.files?.[0] ?? null;
      if (docFile) fd.set('document', await downscaleImage(docFile), 'id.jpg');
    } catch (err) {
      setPreparing(false);
      setError(err instanceof Error ? err.message : 'Could not prepare your photos.');
      return;
    }
    setPreparing(false);

    startTransition(async () => {
      const res = await submitCompanionVerificationAction(INITIAL, fd);
      // Reached only when the action did NOT redirect (i.e. an error).
      if (res && res.status === 'error') setError(res.message);
    });
  }

  const busy = preparing || isPending;

  return (
    <form onSubmit={onSubmit} className={styles.form} noValidate>
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
        <label htmlFor="payoutMethod" className={styles.label}>
          How should we pay you?
        </label>
        <select id="payoutMethod" name="payoutMethod" className={styles.input} defaultValue="venmo">
          <option value="venmo">Venmo</option>
          <option value="zelle">Zelle</option>
          <option value="paypal">PayPal</option>
        </select>
      </div>

      <div className={styles.field}>
        <label htmlFor="payoutHandle" className={styles.label}>
          Your payout handle
        </label>
        <input
          id="payoutHandle"
          name="payoutHandle"
          type="text"
          maxLength={120}
          autoComplete="off"
          placeholder="@your-venmo, phone, or email"
          className={styles.input}
        />
        <p className={styles.helpText}>
          This is how we&apos;ll send your fee after each meet. Only the Konnly team sees it — never
          other members.
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

      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}

      <button type="submit" className={styles.primary} disabled={busy}>
        {busy ? 'Submitting…' : 'Submit for review'}
      </button>
    </form>
  );
}
