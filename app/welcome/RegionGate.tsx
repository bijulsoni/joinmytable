'use client';

// Controlled-rollout region gate, shown around the /welcome onboarding.
//
// Konnly opens region by region (Seattle/Bellevue first) to keep the
// beta scalable. A brand-new user's geolocation decides what they see:
//
//   - admin                  → never gated (test from anywhere)
//   - inside service area     → render the onboarding form (children)
//   - outside service area    → soft block + waitlist capture (no form)
//   - denied / unavailable    → render the form, with a soft note (we
//                               can't prove they're out of region, and
//                               per product decision we don't hard-block
//                               on a denied permission)
//
// The block is "soft": we don't delete the account, we capture the email
// to the waitlist so we can tell them when we expand and use the city to
// prioritize the next region.

import { useEffect, useState } from 'react';
import { isInServiceArea, PNW_REGION_LABEL } from '@/lib/geo/pnw';
import { joinWaitlistAction } from './actions';
import styles from './RegionGate.module.css';

interface Props {
  isAdmin: boolean;
  email: string;
  children: React.ReactNode;
}

type GateState =
  | { phase: 'checking' }
  | { phase: 'allowed' }
  | { phase: 'allowed_unverified' } // location denied/unavailable
  | { phase: 'blocked'; lat: number; lng: number };

export function RegionGate({ isAdmin, email, children }: Props) {
  const [state, setState] = useState<GateState>(
    isAdmin ? { phase: 'allowed' } : { phase: 'checking' },
  );

  useEffect(() => {
    if (isAdmin) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState({ phase: 'allowed_unverified' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        if (isInServiceArea(lat, lng)) {
          setState({ phase: 'allowed' });
        } else {
          setState({ phase: 'blocked', lat, lng });
        }
      },
      () => {
        // Denied or errored — allow through with a soft note rather than
        // hard-blocking on a permission we can't compel.
        setState({ phase: 'allowed_unverified' });
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60_000 },
    );
  }, [isAdmin]);

  if (state.phase === 'checking') {
    return (
      <div className={styles.checking} role="status">
        <span className={styles.spinner} aria-hidden />
        Checking your area…
      </div>
    );
  }

  if (state.phase === 'blocked') {
    return <BlockedView email={email} lat={state.lat} lng={state.lng} />;
  }

  return (
    <>
      {state.phase === 'allowed_unverified' ? (
        <div className={styles.softNote} role="note">
          <span aria-hidden>📍</span>
          <span>
            We couldn’t verify your location. Konnly is open in {PNW_REGION_LABEL} for now — if
            you’re elsewhere, most companions will be too far to meet.
          </span>
        </div>
      ) : null}
      {children}
    </>
  );
}

function BlockedView({ email, lat, lng }: { email: string; lat: number; lng: number }) {
  const [status, setStatus] = useState<'idle' | 'joining' | 'joined' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  async function join() {
    setStatus('joining');
    setMessage(null);

    // Best-effort reverse geocode for a human city label (free, no key).
    let city: string | null = null;
    try {
      const url = new URL('https://nominatim.openstreetmap.org/reverse');
      url.searchParams.set('lat', String(lat));
      url.searchParams.set('lon', String(lng));
      url.searchParams.set('format', 'jsonv2');
      url.searchParams.set('zoom', '10');
      url.searchParams.set('addressdetails', '1');
      const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
      if (res.ok) {
        const json = (await res.json()) as {
          address?: { city?: string; town?: string; village?: string; state?: string };
        };
        const a = json.address ?? {};
        const cityName = a.city ?? a.town ?? a.village ?? null;
        city = [cityName, a.state].filter(Boolean).join(', ') || null;
      }
    } catch {
      // city is a nice-to-have; coords are the source of truth.
    }

    const result = await joinWaitlistAction({ email, lat, lng, city });
    if (result.ok) {
      setStatus('joined');
    } else {
      setStatus('error');
      setMessage(result.error);
    }
  }

  return (
    <div className={styles.blocked}>
      <div className={styles.blockedIcon} aria-hidden>
        🌲
      </div>
      <h2 className={styles.blockedTitle}>We’re not in your area yet</h2>
      <p className={styles.blockedText}>
        Konnly is in private beta and open only in {PNW_REGION_LABEL} right now. We’re expanding
        carefully, region by region, to keep things running smoothly.
      </p>

      {status === 'joined' ? (
        <div className={styles.joined}>
          ✓ You’re on the list. We’ll email <strong>{email}</strong> the moment we open near you.
        </div>
      ) : (
        <>
          <p className={styles.blockedText}>
            Want us to let you know when we reach you? We’ll use where people are waiting to decide
            where to open next.
          </p>
          <button
            type="button"
            className={styles.joinButton}
            onClick={join}
            disabled={status === 'joining'}
          >
            {status === 'joining' ? 'Adding you…' : `Notify me — ${email}`}
          </button>
          {status === 'error' && message ? <p className={styles.error}>{message}</p> : null}
        </>
      )}
    </div>
  );
}
