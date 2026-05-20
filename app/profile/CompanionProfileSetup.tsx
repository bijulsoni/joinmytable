'use client';

// /profile — single role-neutral edit screen.
//
// Sections, in order:
//   1. About you     — bio + service area + photo gallery (uploads via
//                      POST /api/profiles/me/photos/upload)
//   2. Paid companion (opt-in) — a toggle. Off by default. When on,
//                      the user picks the activities they'll host and
//                      sets a rate per activity. Discoverability is
//                      then gated on verification.
//   3. Verification  — status badge + link to /verify.
//
// Availability is deliberately not surfaced — meet-up time is hashed
// out in chat after a request is accepted, so a pre-declared window
// list was friction without payoff.

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ACTIVITY_TYPES, type ActivityType, ACTIVITY_TYPE_META } from '@/lib/types';
import styles from './styles.module.css';

interface ApiErrorBody {
  error?: { code?: string; message?: string };
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as ApiErrorBody;
    return body.error?.message || `Request failed (${res.status}).`;
  } catch {
    return `Request failed (${res.status}).`;
  }
}

interface GeoJSONPoint {
  type: 'Point';
  coordinates: [number, number]; // [lng, lat]
}

interface ProfileDTO {
  id?: string;
  bio?: string | null;
  service_area?: string | null;
  location?: GeoJSONPoint | null;
  activities?: Partial<Record<ActivityType, boolean>>;
  rates?: Partial<Record<ActivityType, number>>;
  photo_urls?: string[];
  account_verification_status?: 'unverified' | 'pending' | 'verified';
}

interface FormValues {
  bio: string;
  service_area: string;
  // Companion-mode opt-in flag. True if the user has any active activity
  // OR explicitly toggles the section on.
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

function dtoToForm(dto: ProfileDTO): FormValues {
  const base = blankForm();
  const activities = ACTIVITY_TYPES.reduce(
    (acc, a) => {
      acc[a] = Boolean(dto.activities?.[a]);
      return acc;
    },
    { ...base.activities },
  );
  return {
    bio: dto.bio ?? '',
    service_area: dto.service_area ?? '',
    // If the saved profile has any activity selected, treat the user as
    // already opted in to paid-companion mode.
    paidCompanionOn: ACTIVITY_TYPES.some((a) => activities[a]),
    activities,
    rates: ACTIVITY_TYPES.reduce(
      (acc, a) => {
        const r = dto.rates?.[a];
        acc[a] = r !== null && r !== undefined ? String(r) : base.rates[a];
        return acc;
      },
      { ...base.rates },
    ),
  };
}

export function ProfileSetup() {
  const [profile, setProfile] = useState<ProfileDTO | null>(null);
  const [form, setForm] = useState<FormValues>(blankForm);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  // `storedLocation` mirrors what the server already has. `pendingLocation`
  // is a fresh capture awaiting save. When the user hits Save, pending
  // (if set) gets PUT; otherwise stored stays untouched. Keeping the two
  // separate means we can show "set 5 min ago" vs "you just re-captured"
  // distinctly.
  const [storedLocation, setStoredLocation] = useState<GeoJSONPoint | null>(null);
  const [pendingLocation, setPendingLocation] = useState<GeoJSONPoint | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<
    | { status: 'idle' }
    | { status: 'saving' }
    | { status: 'ok' }
    | { status: 'error'; message: string }
  >({ status: 'idle' });
  const [photoStatus, setPhotoStatus] = useState<
    { status: 'idle' } | { status: 'uploading' } | { status: 'error'; message: string }
  >({ status: 'idle' });
  const [locStatus, setLocStatus] = useState<
    { status: 'idle' } | { status: 'capturing' } | { status: 'error'; message: string }
  >({ status: 'idle' });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadProfile = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch('/api/profiles/me', { cache: 'no-store' });
      if (res.status === 404) {
        setProfile({});
        setForm(blankForm());
        setPhotoUrls([]);
        setStoredLocation(null);
        return;
      }
      if (!res.ok) {
        setLoadError(await readError(res));
        return;
      }
      // GET /api/profiles/me returns { profile: ProfileDTO }, not the
      // DTO at the top level. Old code unwrapped wrong and the form
      // silently filled with defaults instead of the saved values.
      const json = (await res.json()) as { profile: ProfileDTO };
      const data = json.profile ?? {};
      setProfile(data);
      setForm(dtoToForm(data));
      setPhotoUrls(data.photo_urls ?? []);
      setStoredLocation(data.location ?? null);
      setPendingLocation(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load profile.');
    }
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const onPickFile = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const onFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotoStatus({ status: 'uploading' });
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch('/api/profiles/me/photos/upload', {
        method: 'POST',
        body,
      });
      if (!res.ok) {
        setPhotoStatus({ status: 'error', message: await readError(res) });
        return;
      }
      const json = (await res.json()) as { photo_urls: string[] };
      setPhotoUrls(json.photo_urls ?? []);
      setPhotoStatus({ status: 'idle' });
    } catch (err) {
      setPhotoStatus({
        status: 'error',
        message: err instanceof Error ? err.message : 'Upload failed.',
      });
    }
  }, []);

  const onUseMyLocation = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocStatus({ status: 'error', message: 'Your browser does not support location.' });
      return;
    }
    setLocStatus({ status: 'capturing' });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPendingLocation({
          type: 'Point',
          coordinates: [pos.coords.longitude, pos.coords.latitude],
        });
        setLocStatus({ status: 'idle' });
      },
      (err) => {
        setLocStatus({
          status: 'error',
          message: err.message || 'Could not get your location. Check browser permissions.',
        });
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60_000 },
    );
  }, []);

  const onRemovePhoto = useCallback(async (url: string) => {
    setPhotoStatus({ status: 'uploading' });
    try {
      const res = await fetch('/api/profiles/me/photos', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) {
        setPhotoStatus({ status: 'error', message: await readError(res) });
        return;
      }
      const json = (await res.json()) as { photo_urls: string[] };
      setPhotoUrls(json.photo_urls ?? []);
      setPhotoStatus({ status: 'idle' });
    } catch (err) {
      setPhotoStatus({
        status: 'error',
        message: err instanceof Error ? err.message : 'Could not remove photo.',
      });
    }
  }, []);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaveStatus({ status: 'saving' });

    // If the user opted into paid-companion mode, validate rates for
    // every selected activity. If they didn't, send all-false activities
    // (so any existing companion-mode rows clear out) and skip rates.
    const activities = ACTIVITY_TYPES.reduce<Partial<Record<ActivityType, boolean>>>((acc, a) => {
      acc[a] = form.paidCompanionOn ? form.activities[a] : false;
      return acc;
    }, {});

    let rates: Partial<Record<ActivityType, number>> = {};
    if (form.paidCompanionOn) {
      if (!ACTIVITY_TYPES.some((a) => activities[a])) {
        setSaveStatus({
          status: 'error',
          message: 'Pick at least one activity, or switch off paid-companion mode.',
        });
        return;
      }
      for (const a of ACTIVITY_TYPES) {
        if (!activities[a]) continue;
        const n = Number(form.rates[a]);
        if (!Number.isFinite(n) || n < 1 || n > 500) {
          setSaveStatus({
            status: 'error',
            message: `Rate for ${a.replace('_', ' ')} must be between $1 and $500.`,
          });
          return;
        }
        rates[a] = Math.round(n);
      }
    } else {
      rates = {};
    }

    try {
      // Only include `location` in the payload when the user just
      // re-captured it — otherwise we'd round-trip the stored GeoJSON
      // unchanged, which is harmless but noisy.
      const payload: Record<string, unknown> = {
        bio: form.bio.trim() || null,
        service_area: form.service_area.trim() || null,
        activities,
        rates,
      };
      if (pendingLocation) {
        payload.location = pendingLocation;
      }
      const res = await fetch('/api/profiles/me', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setSaveStatus({ status: 'error', message: await readError(res) });
        return;
      }
      const updatedJson = (await res.json()) as { profile: ProfileDTO };
      const updated = updatedJson.profile ?? {};
      setProfile(updated);
      setStoredLocation(updated.location ?? null);
      setPendingLocation(null);
      setSaveStatus({ status: 'ok' });
    } catch (err) {
      setSaveStatus({
        status: 'error',
        message: err instanceof Error ? err.message : 'Save failed.',
      });
    }
  };

  if (loadError) {
    return <div className={styles.error}>{loadError}</div>;
  }
  if (profile === null) {
    return <div className={styles.notice}>Loading your profile…</div>;
  }

  const verifStatus = profile.account_verification_status ?? 'unverified';
  const verifBadgeClass =
    verifStatus === 'verified'
      ? styles.verifVerified
      : verifStatus === 'pending'
        ? styles.verifPending
        : styles.verifUnverified;

  return (
    <form className={styles.card} onSubmit={onSubmit}>
      {/* ---------- About you ---------- */}
      <h2 className={styles.cardHeading}>About you</h2>
      <p className={styles.cardSubhead}>
        A short bio and a city tell other folks who they&apos;d be sharing a meal with.
      </p>

      <label className={styles.label} htmlFor="bio">
        Bio
      </label>
      <textarea
        id="bio"
        className={styles.textarea}
        rows={4}
        maxLength={4000}
        value={form.bio}
        onChange={(e) => setForm({ ...form, bio: e.target.value })}
        placeholder="A line or two about you — what you do, what you like to talk about."
      />

      <label className={styles.label} htmlFor="service_area">
        City / service area
      </label>
      <input
        id="service_area"
        className={styles.input}
        type="text"
        maxLength={200}
        value={form.service_area}
        onChange={(e) => setForm({ ...form, service_area: e.target.value })}
        placeholder="e.g. San Francisco, CA"
      />
      <div className={styles.locationRow}>
        <button
          type="button"
          className={styles.secondary}
          onClick={onUseMyLocation}
          disabled={locStatus.status === 'capturing'}
        >
          📍{' '}
          {locStatus.status === 'capturing'
            ? 'Getting your location…'
            : pendingLocation
              ? 'Re-capture location'
              : storedLocation
                ? 'Update my current location'
                : 'Use my current location'}
        </button>
        <span className={styles.locationStatus}>
          {pendingLocation ? (
            <span className={styles.locationStatusOk}>✓ New coords ready — hit Save to apply.</span>
          ) : storedLocation ? (
            <span className={styles.locationStatusOk}>
              ✓ Location is set. Re-capture when you actually relocate.
            </span>
          ) : (
            <span className={styles.locationStatusWarn}>
              Not set yet. Without coords you won&apos;t appear in nearby search.
            </span>
          )}
        </span>
        {locStatus.status === 'error' ? (
          <p className={styles.fieldError}>{locStatus.message}</p>
        ) : null}
      </div>

      <label className={styles.label}>Photos</label>
      <p className={styles.helpText}>Up to 8. The first one shows up as your hero on /discover.</p>
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
              disabled={photoStatus.status === 'uploading'}
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
            disabled={photoStatus.status === 'uploading'}
            aria-label="Add a photo"
          >
            {photoStatus.status === 'uploading' ? '…' : '+'}
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
      {photoStatus.status === 'error' ? (
        <p className={styles.fieldError}>{photoStatus.message}</p>
      ) : null}

      <div className={styles.divider} />

      {/* ---------- Paid companion (opt-in) ---------- */}
      <h2 className={styles.cardHeading}>Share a meal as a paid companion?</h2>
      <p className={styles.cardSubhead}>
        Off by default. Flip it on if you&apos;d like to be discoverable to seekers who pay for
        company. You set your own rate per activity; the seeker also covers the activity bill.
      </p>

      <label className={styles.toggleRow}>
        <input
          type="checkbox"
          checked={form.paidCompanionOn}
          onChange={(e) => setForm({ ...form, paidCompanionOn: e.target.checked })}
        />
        <span>
          <strong>Yes, list me as a paid companion.</strong>
          <span className={styles.helpText}> Verification is required before you appear.</span>
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
                  <span className={styles.helpText}>
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

      <div className={styles.divider} />

      {/* ---------- Verification ---------- */}
      <h2 className={styles.cardHeading}>Identity verification</h2>
      <p className={styles.cardSubhead}>
        Verification keeps the marketplace trustworthy. Required to be discovered as a paid
        companion.
      </p>
      <div className={styles.verificationRow}>
        <span className={[styles.verifBadge, verifBadgeClass].join(' ')}>{verifStatus}</span>
        <Link href="/verify" className={styles.photoLink}>
          {verifStatus === 'verified' ? 'Manage' : 'Start verification'} →
        </Link>
      </div>

      <div className={styles.divider} />

      {saveStatus.status === 'error' ? (
        <div className={styles.error}>{saveStatus.message}</div>
      ) : null}
      {saveStatus.status === 'ok' ? <div className={styles.success}>Saved.</div> : null}

      <button type="submit" className={styles.primary} disabled={saveStatus.status === 'saving'}>
        {saveStatus.status === 'saving' ? 'Saving…' : 'Save changes'}
      </button>
    </form>
  );
}
