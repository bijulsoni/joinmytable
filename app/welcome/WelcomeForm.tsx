'use client';

// First-run onboarding form. Mirrors the relevant fields from /profile
// in a single linear flow so a new user doesn't have to discover where
// to set things up — they just walk down the page and hit Continue.
//
// All fields optional. The Continue button calls the server action,
// which stamps users.onboarded_at = now() regardless of which fields
// were filled. After that, future logins route to /discover.

import { useCallback, useRef, useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ACTIVITY_TYPES, type ActivityType, ACTIVITY_TYPE_META } from '@/lib/types';
import { completeWelcomeAction } from './actions';
import styles from './styles.module.css';

interface GeoJSONPoint {
  type: 'Point';
  coordinates: [number, number]; // [lng, lat]
}

interface Props {
  initialName: string;
}

interface FormValues {
  bio: string;
  service_area: string;
  paidCompanionOn: boolean;
  activities: Record<ActivityType, boolean>;
  rates: Record<ActivityType, string>;
}

function blankForm(): FormValues {
  return {
    bio: '',
    service_area: '',
    paidCompanionOn: false,
    activities: { lunch: false, dinner: false, coffee: false, happy_hour: false },
    rates: {
      lunch: String(ACTIVITY_TYPE_META.lunch.suggestedFeeUsd.min + 2),
      dinner: String(ACTIVITY_TYPE_META.dinner.suggestedFeeUsd.min + 2),
      coffee: String(ACTIVITY_TYPE_META.coffee.suggestedFeeUsd.min + 2),
      happy_hour: String(ACTIVITY_TYPE_META.happy_hour.suggestedFeeUsd.min + 2),
    },
  };
}

export function WelcomeForm({ initialName }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<FormValues>(blankForm);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [pendingLocation, setPendingLocation] = useState<GeoJSONPoint | null>(null);
  const [photoStatus, setPhotoStatus] = useState<
    { state: 'idle' } | { state: 'uploading' } | { state: 'error'; message: string }
  >({ state: 'idle' });
  const [locStatus, setLocStatus] = useState<
    { state: 'idle' } | { state: 'capturing' } | { state: 'error'; message: string }
  >({ state: 'idle' });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onPickFile = useCallback(() => fileInputRef.current?.click(), []);

  const onFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotoStatus({ state: 'uploading' });
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch('/api/profiles/me/photos/upload', { method: 'POST', body });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        throw new Error(json.error?.message ?? `Upload failed (${res.status}).`);
      }
      const json = (await res.json()) as { photo_urls: string[] };
      setPhotoUrls(json.photo_urls ?? []);
      setPhotoStatus({ state: 'idle' });
    } catch (err) {
      setPhotoStatus({
        state: 'error',
        message: err instanceof Error ? err.message : 'Upload failed.',
      });
    }
  }, []);

  const onRemovePhoto = useCallback(async (url: string) => {
    setPhotoStatus({ state: 'uploading' });
    try {
      const res = await fetch('/api/profiles/me/photos', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        throw new Error(json.error?.message ?? `Remove failed (${res.status}).`);
      }
      const json = (await res.json()) as { photo_urls: string[] };
      setPhotoUrls(json.photo_urls ?? []);
      setPhotoStatus({ state: 'idle' });
    } catch (err) {
      setPhotoStatus({
        state: 'error',
        message: err instanceof Error ? err.message : 'Could not remove photo.',
      });
    }
  }, []);

  const onUseMyLocation = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocStatus({ state: 'error', message: 'Your browser does not support location.' });
      return;
    }
    setLocStatus({ state: 'capturing' });
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setPendingLocation({ type: 'Point', coordinates: [lng, lat] });
        // Reverse geocode via Nominatim (free, no key). Failures are
        // silent — the lat/lng is the source of truth; the label is
        // a convenience.
        try {
          const url = new URL('https://nominatim.openstreetmap.org/reverse');
          url.searchParams.set('lat', String(lat));
          url.searchParams.set('lon', String(lng));
          url.searchParams.set('format', 'jsonv2');
          url.searchParams.set('zoom', '14');
          url.searchParams.set('addressdetails', '1');
          const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
          if (res.ok) {
            const json = (await res.json()) as {
              address?: {
                neighbourhood?: string;
                suburb?: string;
                quarter?: string;
                city?: string;
                town?: string;
                village?: string;
                state?: string;
              };
              display_name?: string;
            };
            const a = json.address ?? {};
            const locality = a.neighbourhood ?? a.suburb ?? a.quarter ?? null;
            const city = a.city ?? a.town ?? a.village ?? null;
            const state = a.state ?? null;
            const cityState = [city, state].filter(Boolean).join(', ');
            const label =
              locality && city ? `${locality}, ${cityState}` : cityState || json.display_name || '';
            if (label) setForm((prev) => ({ ...prev, service_area: label }));
          }
        } catch {
          // Network blip — coords still captured.
        }
        setLocStatus({ state: 'idle' });
      },
      (err) => {
        setLocStatus({
          state: 'error',
          message: err.message || 'Could not get your location. Check browser permissions.',
        });
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60_000 },
    );
  }, []);

  const onSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setSubmitError(null);

      // Validate rates if companion mode is on. Everything else is
      // optional — bio empty is fine, no photos is fine, no location
      // is fine. The server action stamps onboarded_at regardless.
      const activities: Partial<Record<ActivityType, boolean>> = {};
      const rates: Partial<Record<ActivityType, number>> = {};
      if (form.paidCompanionOn) {
        let anySelected = false;
        for (const a of ACTIVITY_TYPES) {
          activities[a] = form.activities[a];
          if (form.activities[a]) anySelected = true;
        }
        if (!anySelected) {
          setSubmitError(
            'Pick at least one activity, or uncheck "I want to be paid as a companion."',
          );
          return;
        }
        for (const a of ACTIVITY_TYPES) {
          if (!form.activities[a]) continue;
          const n = Number(form.rates[a]);
          if (!Number.isFinite(n) || n < 1 || n > 500) {
            setSubmitError(`Rate for ${a.replace('_', ' ')} must be between $1 and $500.`);
            return;
          }
          rates[a] = Math.round(n);
        }
      }

      startTransition(async () => {
        const result = await completeWelcomeAction({
          bio: form.bio.trim() || null,
          service_area: form.service_area.trim() || null,
          location: pendingLocation,
          paidCompanionOn: form.paidCompanionOn,
          activities,
          rates,
        });
        if (!result.ok) {
          setSubmitError(result.error);
          return;
        }
        router.push('/discover');
      });
    },
    [form, pendingLocation, router],
  );

  const firstName = (initialName ?? '').trim().split(/\s+/)[0] || 'there';

  return (
    <form className={styles.card} onSubmit={onSubmit}>
      {/* Photos */}
      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>Photos</h2>
        <p className={styles.sectionHelp}>
          Up to 8. The first one becomes your hero on /discover. Optional.
        </p>
        <div className={styles.photoGrid}>
          {photoUrls.map((url) => (
            <div key={url} className={styles.photoTile}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="Profile photo" className={styles.photoTileImg} />
              <button
                type="button"
                className={styles.photoRemove}
                onClick={() => void onRemovePhoto(url)}
                aria-label="Remove photo"
                disabled={photoStatus.state === 'uploading'}
              >
                ×
              </button>
            </div>
          ))}
          {photoUrls.length < 8 ? (
            <button
              type="button"
              className={styles.photoAddTile}
              onClick={onPickFile}
              disabled={photoStatus.state === 'uploading'}
              aria-label="Add a photo"
            >
              {photoStatus.state === 'uploading' ? '…' : '+'}
            </button>
          ) : null}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          onChange={(e) => void onFileChange(e)}
          style={{ display: 'none' }}
        />
        {photoStatus.state === 'error' ? (
          <p className={styles.fieldError}>{photoStatus.message}</p>
        ) : null}
      </section>

      {/* Bio */}
      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>Short bio</h2>
        <p className={styles.sectionHelp}>
          A line or two — what you do, what you like to talk about. Optional.
        </p>
        <textarea
          className={styles.textarea}
          rows={3}
          maxLength={4000}
          value={form.bio}
          onChange={(e) => setForm({ ...form, bio: e.target.value })}
          placeholder={`Hey, I'm ${firstName}. I work in… I love…`}
        />
      </section>

      {/* Location */}
      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>City</h2>
        <p className={styles.sectionHelp}>Helps us show you companions near you. Optional.</p>
        <input
          className={styles.input}
          type="text"
          maxLength={200}
          value={form.service_area}
          onChange={(e) => setForm({ ...form, service_area: e.target.value })}
          placeholder="e.g. Seattle, WA"
        />
        <button
          type="button"
          className={styles.secondary}
          onClick={onUseMyLocation}
          disabled={locStatus.state === 'capturing'}
        >
          📍{' '}
          {locStatus.state === 'capturing'
            ? 'Getting your location…'
            : pendingLocation
              ? 'Re-capture location'
              : 'Use my current location'}
        </button>
        {locStatus.state === 'error' ? (
          <p className={styles.fieldError}>{locStatus.message}</p>
        ) : null}
        {pendingLocation ? <p className={styles.fieldOk}>✓ Location captured.</p> : null}
      </section>

      {/* Paid-companion opt-in */}
      <section className={styles.section}>
        <label className={styles.toggleRow}>
          <input
            type="checkbox"
            checked={form.paidCompanionOn}
            onChange={(e) => setForm({ ...form, paidCompanionOn: e.target.checked })}
          />
          <span>
            <strong>I want to be paid to share meals as a companion.</strong>
            <span className={styles.sectionHelp}>
              {' '}
              You can switch this on or off any time. Verification is required before you appear on
              /discover.
            </span>
          </span>
        </label>

        {form.paidCompanionOn ? (
          <div className={styles.activityList}>
            {ACTIVITY_TYPES.map((a) => {
              const meta = ACTIVITY_TYPE_META[a];
              const enabled = form.activities[a];
              return (
                <div key={a} className={styles.activityRow}>
                  <label className={styles.checkboxRow}>
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          activities: { ...form.activities, [a]: e.target.checked },
                        })
                      }
                    />
                    <strong>{meta.label}</strong>
                    <span className={styles.sectionHelp}>
                      (${meta.suggestedFeeUsd.min}–${meta.suggestedFeeUsd.max} suggested)
                    </span>
                  </label>
                  {enabled ? (
                    <label className={styles.rateLabel}>
                      $
                      <input
                        type="number"
                        min={1}
                        max={500}
                        step={1}
                        className={styles.rateInput}
                        value={form.rates[a]}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            rates: { ...form.rates, [a]: e.target.value },
                          })
                        }
                      />
                    </label>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
      </section>

      {submitError ? <div className={styles.error}>{submitError}</div> : null}

      <button type="submit" className={styles.primary} disabled={isPending}>
        {isPending ? 'Saving…' : 'Continue →'}
      </button>
    </form>
  );
}
