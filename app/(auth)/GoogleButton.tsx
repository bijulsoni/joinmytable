'use client';

// "Continue with Google" button. Shared by /sign-up and /login.
//
// On LOGIN it just kicks off Google OAuth → /callback, which routes the
// returning user home.
//
// On SIGN-UP it must carry the private-beta invite code through to the
// callback (the gate is a beta invariant — social sign-up can't bypass
// it). The code is read at click time from the form's `inviteCode`
// input (the same field the email path uses, whether typed or
// auto-filled from a ?invite= link). If it's empty we stop and ask for
// it rather than starting an OAuth round-trip the callback would just
// reject.

import { useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import styles from './styles.module.css';

interface Props {
  mode: 'sign-up' | 'login';
}

function GoogleIcon() {
  return (
    <svg className={styles.oauthIcon} viewBox="0 0 18 18" aria-hidden focusable="false">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.346l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.167 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}

export function GoogleButton({ mode }: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick(e: React.MouseEvent<HTMLButtonElement>) {
    setError(null);

    const params = new URLSearchParams();
    if (mode === 'sign-up') {
      const form = e.currentTarget.closest('form');
      const input = form?.querySelector<HTMLInputElement>('input[name="inviteCode"]');
      const invite = (input?.value ?? '').trim().toUpperCase();
      if (!invite) {
        setError('Enter your invite code first, then continue with Google.');
        return;
      }
      params.set('invite', invite);
    }

    setPending(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const redirectTo = `${window.location.origin}/callback${
        params.toString() ? `?${params.toString()}` : ''
      }`;
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo },
      });
      if (oauthError) {
        setError(oauthError.message);
        setPending(false);
      }
      // On success the browser is redirected to Google — no further work.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start Google sign-in.');
      setPending(false);
    }
  }

  return (
    <>
      <button type="button" className={styles.oauthButton} onClick={onClick} disabled={pending}>
        <GoogleIcon />
        {pending ? 'Connecting…' : 'Continue with Google'}
      </button>
      {error ? (
        <div className={styles.error} role="alert">
          {error}
        </div>
      ) : null}
    </>
  );
}
