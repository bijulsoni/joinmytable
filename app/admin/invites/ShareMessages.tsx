'use client';

// Renders one invite code's share kit: the sign-up link + the three
// ready-to-paste channel messages, each with a copy button. Used for both
// freshly-minted codes (MintInviteForm) and existing codes re-opened from
// the table (InviteCodesTable), so the copy is identical everywhere.

import { useCallback, useState } from 'react';
import { SHARE_VARIANTS, signupUrl } from './share';
import shared from '../styles.module.css';
import styles from './styles.module.css';

export function ShareMessages({ code }: { code: string }) {
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
export function CopyButton({ text, label }: { text: string; label: string }) {
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
