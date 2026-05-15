'use client';

// Client-rendered companion profile setup.
//
// Wired to the frozen profiles API contract
// (/app/api/profiles/CONTRACT.md). Fetches the profile and availability
// list on mount, then lets the companion edit them with explicit
// loading / empty / error states.
//
// Verification is read-only here: the API never lets us write
// verification_status, and the verification flow itself lives in the
// Auth & Identity agent's segment (`/verify`). We just surface the
// current state and link out.

import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/lib/auth';
import { Spinner } from '@/components/Spinner';
import { StatusMessage } from '@/components/StatusMessage';
import { MEAL_TYPES, type MealType, type VerificationStatus } from '@/lib/types';
import type { AvailabilityDTO, OwnCompanionProfileDTO } from '@/app/api/profiles/_lib/types';
import styles from './styles.module.css';

// ---------------------------------------------------------------------------
// Wire-format helpers
// ---------------------------------------------------------------------------

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

// Default form values for a brand-new profile. Match the API CHECK
// constraints so the first submit succeeds without further prompting.
const DEFAULT_RATE_DOLLARS = 22;
const DEFAULT_RADIUS_KM = 5;

interface ProfileFormValues {
  headline: string;
  bio_long: string;
  rate_dollars: string; // bound to <input type="number"> => keep as string
  rate_currency: string;
  meal_types: MealType[];
  latitude: string;
  longitude: string;
  service_radius_km: string;
}

function blankFormValues(): ProfileFormValues {
  return {
    headline: '',
    bio_long: '',
    rate_dollars: String(DEFAULT_RATE_DOLLARS),
    rate_currency: 'USD',
    meal_types: ['lunch', 'dinner'],
    latitude: '',
    longitude: '',
    service_radius_km: String(DEFAULT_RADIUS_KM),
  };
}

function dtoToForm(dto: OwnCompanionProfileDTO): ProfileFormValues {
  const [lng, lat] = dto.service_area_center.coordinates;
  return {
    headline: dto.headline ?? '',
    bio_long: dto.bio_long ?? '',
    rate_dollars: (dto.rate_cents / 100).toFixed(2),
    rate_currency: dto.rate_currency,
    meal_types: dto.meal_types,
    latitude: String(lat),
    longitude: String(lng),
    service_radius_km: (dto.service_radius_m / 1000).toString(),
  };
}

interface FormErrors {
  headline?: string;
  bio_long?: string;
  rate_dollars?: string;
  rate_currency?: string;
  meal_types?: string;
  latitude?: string;
  longitude?: string;
  service_radius_km?: string;
}

function validateForm(v: ProfileFormValues): {
  errors: FormErrors;
  payload?: {
    headline: string | null;
    bio_long: string | null;
    rate_cents: number;
    rate_currency: string;
    meal_types: MealType[];
    service_area_center: { type: 'Point'; coordinates: [number, number] };
    service_radius_m: number;
  };
} {
  const errors: FormErrors = {};

  const headlineTrim = v.headline.trim();
  if (headlineTrim.length > 120) {
    errors.headline = 'Headline must be 120 characters or fewer.';
  }

  const bioTrim = v.bio_long.trim();
  if (bioTrim.length > 4000) {
    errors.bio_long = 'Bio must be 4000 characters or fewer.';
  }

  const rateNum = Number(v.rate_dollars);
  if (!Number.isFinite(rateNum) || rateNum < 5 || rateNum > 200) {
    errors.rate_dollars = 'Rate must be between $5 and $200.';
  }
  const rateCents = Math.round(rateNum * 100);

  if (!/^[A-Z]{3}$/.test(v.rate_currency)) {
    errors.rate_currency = 'Currency must be a 3-letter ISO code (e.g. USD).';
  }

  if (v.meal_types.length === 0) {
    errors.meal_types = 'Pick at least one meal type.';
  }

  const lat = Number(v.latitude);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    errors.latitude = 'Latitude must be between -90 and 90.';
  }
  const lng = Number(v.longitude);
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    errors.longitude = 'Longitude must be between -180 and 180.';
  }

  const radiusKm = Number(v.service_radius_km);
  if (!Number.isFinite(radiusKm) || radiusKm < 0.5 || radiusKm > 100) {
    errors.service_radius_km = 'Service radius must be 0.5 km to 100 km.';
  }
  const radiusM = Math.round(radiusKm * 1000);

  if (Object.keys(errors).length > 0) {
    return { errors };
  }

  return {
    errors,
    payload: {
      headline: headlineTrim.length === 0 ? null : headlineTrim,
      bio_long: bioTrim.length === 0 ? null : bioTrim,
      rate_cents: rateCents,
      rate_currency: v.rate_currency,
      meal_types: v.meal_types,
      service_area_center: { type: 'Point', coordinates: [lng, lat] },
      service_radius_m: radiusM,
    },
  };
}

// ---------------------------------------------------------------------------
// Top-level component
// ---------------------------------------------------------------------------

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; profile: OwnCompanionProfileDTO | null }
  | { kind: 'error'; message: string };

export function CompanionProfileSetup() {
  const { isLoading: authLoading, session } = useAuth();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (authLoading) return;
    if (!session) {
      // The server component already redirected, but if the session
      // expires after the page has mounted, surface a friendly state.
      setState({
        kind: 'error',
        message: 'Your session expired. Please sign in again.',
      });
      return;
    }

    let cancelled = false;
    setState({ kind: 'loading' });

    fetch('/api/profiles/me', {
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    })
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 404) {
          setState({ kind: 'ready', profile: null });
          return;
        }
        if (!res.ok) {
          setState({ kind: 'error', message: await readError(res) });
          return;
        }
        const body = (await res.json()) as { profile: OwnCompanionProfileDTO };
        setState({ kind: 'ready', profile: body.profile });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          kind: 'error',
          message: err instanceof Error ? err.message : 'Could not load your profile.',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, session, reloadKey]);

  const retry = useCallback(() => setReloadKey((k) => k + 1), []);

  const onProfileSaved = useCallback((next: OwnCompanionProfileDTO) => {
    setState({ kind: 'ready', profile: next });
  }, []);

  if (state.kind === 'loading') {
    return <ProfileLoadingSkeleton />;
  }

  if (state.kind === 'error') {
    return (
      <section className={styles.card}>
        <div className={styles.statusBanner}>
          <StatusMessage tone="error">{state.message}</StatusMessage>
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.secondary} onClick={retry}>
            Try again
          </button>
        </div>
      </section>
    );
  }

  return (
    <>
      <ProfileCard profile={state.profile} onSaved={onProfileSaved} />
      <AvailabilityCard hasProfile={state.profile !== null} reloadKey={reloadKey} />
    </>
  );
}

function ProfileLoadingSkeleton() {
  return (
    <section className={styles.card} aria-busy="true">
      <div className={styles.skeleton}>
        <div className={`${styles.skeletonBar} ${styles.narrow}`} />
        <div className={`${styles.skeletonBar} ${styles.wide}`} />
        <div className={styles.skeletonBar} />
        <div className={styles.skeletonBar} />
        <div className={`${styles.skeletonBar} ${styles.narrow}`} />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Profile card (form)
// ---------------------------------------------------------------------------

function ProfileCard({
  profile,
  onSaved,
}: {
  profile: OwnCompanionProfileDTO | null;
  onSaved: (p: OwnCompanionProfileDTO) => void;
}) {
  const [values, setValues] = useState<ProfileFormValues>(() =>
    profile ? dtoToForm(profile) : blankFormValues(),
  );
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitState, setSubmitState] = useState<
    | { kind: 'idle' }
    | { kind: 'submitting' }
    | { kind: 'success'; created: boolean }
    | { kind: 'error'; message: string }
  >({ kind: 'idle' });

  // If a parent action replaces the profile (e.g. after a successful save
  // the parent updates state), keep the form in sync.
  useEffect(() => {
    if (profile) setValues(dtoToForm(profile));
  }, [profile]);

  const setField = useCallback(
    <K extends keyof ProfileFormValues>(k: K, val: ProfileFormValues[K]) => {
      setValues((cur) => ({ ...cur, [k]: val }));
    },
    [],
  );

  const toggleMealType = useCallback((mt: MealType, checked: boolean) => {
    setValues((cur) => {
      const set = new Set(cur.meal_types);
      if (checked) set.add(mt);
      else set.delete(mt);
      return { ...cur, meal_types: Array.from(set) };
    });
  }, []);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const { errors: ve, payload } = validateForm(values);
    setErrors(ve);
    if (!payload) {
      setSubmitState({
        kind: 'error',
        message: 'Fix the highlighted fields and try again.',
      });
      return;
    }

    setSubmitState({ kind: 'submitting' });
    try {
      const res = await fetch('/api/profiles/me', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setSubmitState({ kind: 'error', message: await readError(res) });
        return;
      }
      const body = (await res.json()) as { profile: OwnCompanionProfileDTO };
      onSaved(body.profile);
      setSubmitState({ kind: 'success', created: res.status === 201 });
    } catch (err: unknown) {
      setSubmitState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Could not save your profile.',
      });
    }
  };

  const requestLocation = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setSubmitState({
        kind: 'error',
        message: 'Geolocation is not available in this browser.',
      });
      return;
    }
    // Core product rule: request location only with explicit permission.
    // The browser surfaces a permission prompt; we just consume the result.
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setValues((cur) => ({
          ...cur,
          latitude: pos.coords.latitude.toFixed(6),
          longitude: pos.coords.longitude.toFixed(6),
        }));
      },
      (err) => {
        setSubmitState({
          kind: 'error',
          message:
            err.code === err.PERMISSION_DENIED
              ? 'Location permission denied. Enter coordinates manually.'
              : 'Could not read your location.',
        });
      },
      { enableHighAccuracy: false, timeout: 8_000 },
    );
  }, []);

  const isSubmitting = submitState.kind === 'submitting';
  const verificationStatus = profile?.verification_status ?? 'unverified';

  return (
    <section className={styles.card}>
      <h2 className={styles.cardHeading}>About you</h2>
      <p className={styles.cardSubhead}>These details show on your public profile.</p>

      <VerificationBanner status={verificationStatus} hasProfile={profile !== null} />

      {profile === null && (
        <div className={styles.statusBanner}>
          <StatusMessage tone="notice">
            You don&apos;t have a companion profile yet. Fill in the details below and save to
            create one.
          </StatusMessage>
        </div>
      )}

      {submitState.kind === 'success' && (
        <div className={styles.statusBanner}>
          <StatusMessage tone="success">
            {submitState.created ? 'Profile created.' : 'Profile updated.'}
          </StatusMessage>
        </div>
      )}
      {submitState.kind === 'error' && (
        <div className={styles.statusBanner}>
          <StatusMessage tone="error">{submitState.message}</StatusMessage>
        </div>
      )}

      <form className={styles.form} onSubmit={onSubmit} noValidate>
        <div className={styles.field}>
          <label htmlFor="headline" className={styles.label}>
            Headline
          </label>
          <input
            id="headline"
            type="text"
            value={values.headline}
            onChange={(e) => setField('headline', e.target.value)}
            maxLength={120}
            placeholder="e.g. Great conversation over Italian"
            className={styles.input}
            disabled={isSubmitting}
          />
          {errors.headline && <p className={styles.fieldError}>{errors.headline}</p>}
        </div>

        <div className={styles.field}>
          <label htmlFor="bio_long" className={styles.label}>
            About you
          </label>
          <textarea
            id="bio_long"
            value={values.bio_long}
            onChange={(e) => setField('bio_long', e.target.value)}
            maxLength={4000}
            placeholder="What kind of company are you? What do you like to talk about?"
            className={styles.textarea}
            rows={5}
            disabled={isSubmitting}
          />
          <p className={styles.helpText}>{values.bio_long.length} / 4000 characters</p>
          {errors.bio_long && <p className={styles.fieldError}>{errors.bio_long}</p>}
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <label htmlFor="rate_dollars" className={styles.label}>
              Companionship fee
            </label>
            <input
              id="rate_dollars"
              type="number"
              inputMode="decimal"
              min={5}
              max={200}
              step={1}
              value={values.rate_dollars}
              onChange={(e) => setField('rate_dollars', e.target.value)}
              className={styles.input}
              disabled={isSubmitting}
            />
            <p className={styles.helpText}>
              Flat fee per meal. $5 — $200. Seekers also cover the meal.
            </p>
            {errors.rate_dollars && <p className={styles.fieldError}>{errors.rate_dollars}</p>}
          </div>

          <div className={styles.field}>
            <label htmlFor="rate_currency" className={styles.label}>
              Currency
            </label>
            <input
              id="rate_currency"
              type="text"
              value={values.rate_currency}
              onChange={(e) => setField('rate_currency', e.target.value.toUpperCase())}
              maxLength={3}
              className={styles.input}
              disabled={isSubmitting}
            />
            <p className={styles.helpText}>3-letter ISO code (e.g. USD).</p>
            {errors.rate_currency && <p className={styles.fieldError}>{errors.rate_currency}</p>}
          </div>
        </div>

        <div className={styles.field}>
          <span className={styles.label}>Meal types</span>
          <div className={styles.checkboxGroup}>
            {MEAL_TYPES.map((mt) => (
              <label key={mt} className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={values.meal_types.includes(mt)}
                  onChange={(e) => toggleMealType(mt, e.target.checked)}
                  disabled={isSubmitting}
                />
                <span>I&apos;m available for {mt}</span>
              </label>
            ))}
          </div>
          {errors.meal_types && <p className={styles.fieldError}>{errors.meal_types}</p>}
        </div>

        <h3 className={styles.cardHeading} style={{ marginTop: '0.25rem' }}>
          Service area
        </h3>
        <div className={styles.row}>
          <div className={styles.field}>
            <label htmlFor="latitude" className={styles.label}>
              Latitude
            </label>
            <input
              id="latitude"
              type="number"
              inputMode="decimal"
              step="any"
              value={values.latitude}
              onChange={(e) => setField('latitude', e.target.value)}
              className={styles.input}
              disabled={isSubmitting}
            />
            {errors.latitude && <p className={styles.fieldError}>{errors.latitude}</p>}
          </div>
          <div className={styles.field}>
            <label htmlFor="longitude" className={styles.label}>
              Longitude
            </label>
            <input
              id="longitude"
              type="number"
              inputMode="decimal"
              step="any"
              value={values.longitude}
              onChange={(e) => setField('longitude', e.target.value)}
              className={styles.input}
              disabled={isSubmitting}
            />
            {errors.longitude && <p className={styles.fieldError}>{errors.longitude}</p>}
          </div>
        </div>

        <div className={styles.field}>
          <button
            type="button"
            className={styles.secondary}
            onClick={requestLocation}
            disabled={isSubmitting}
          >
            Use my current location
          </button>
          <p className={styles.helpText}>
            We&apos;ll ask your browser for permission before reading your location. Adjust the
            coordinates above if needed.
          </p>
        </div>

        <div className={styles.field}>
          <label htmlFor="service_radius_km" className={styles.label}>
            Service radius (km)
          </label>
          <input
            id="service_radius_km"
            type="number"
            inputMode="decimal"
            min={0.5}
            max={100}
            step={0.5}
            value={values.service_radius_km}
            onChange={(e) => setField('service_radius_km', e.target.value)}
            className={styles.input}
            disabled={isSubmitting}
          />
          <p className={styles.helpText}>How far you&apos;ll travel for a meal. 0.5 km — 100 km.</p>
          {errors.service_radius_km && (
            <p className={styles.fieldError}>{errors.service_radius_km}</p>
          )}
        </div>

        <div className={styles.actions}>
          <button type="submit" className={styles.primary} disabled={isSubmitting}>
            {isSubmitting ? (
              <span style={{ display: 'inline-flex', gap: '0.5rem', alignItems: 'center' }}>
                <Spinner size={14} />
                Saving...
              </span>
            ) : profile ? (
              'Save changes'
            ) : (
              'Create profile'
            )}
          </button>
        </div>
      </form>
    </section>
  );
}

function VerificationBanner({
  status,
  hasProfile,
}: {
  status: VerificationStatus;
  hasProfile: boolean;
}) {
  if (!hasProfile) return null;

  if (status === 'verified') {
    return (
      <div className={styles.verificationRow}>
        <span className={`${styles.verifBadge} ${styles.verifVerified}`}>Verified</span>
        <span>Seekers can discover and book you.</span>
      </div>
    );
  }
  if (status === 'pending') {
    return (
      <div className={styles.verificationRow}>
        <span className={`${styles.verifBadge} ${styles.verifPending}`}>Pending</span>
        <span>Verification submitted — we&apos;ll email you when review is done.</span>
      </div>
    );
  }
  if (status === 'rejected') {
    return (
      <div className={styles.verificationRow}>
        <span className={`${styles.verifBadge} ${styles.verifRejected}`}>Rejected</span>
        <Link href="/verify">Restart verification</Link>
      </div>
    );
  }
  return (
    <div className={styles.verificationRow}>
      <span className={`${styles.verifBadge} ${styles.verifUnverified}`}>Not verified</span>
      <Link href="/verify">Verify your identity to start receiving requests</Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Availability card
// ---------------------------------------------------------------------------

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

interface AvailabilityFormValues {
  day_of_week: number;
  start_time: string;
  end_time: string;
  meal_type: MealType;
  timezone: string;
}

function defaultAvailabilityForm(): AvailabilityFormValues {
  const tz =
    typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' : 'UTC';
  return {
    day_of_week: 1,
    start_time: '12:00',
    end_time: '13:30',
    meal_type: 'lunch',
    timezone: tz,
  };
}

type AvailLoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; items: AvailabilityDTO[] }
  | { kind: 'error'; message: string };

function AvailabilityCard({ hasProfile, reloadKey }: { hasProfile: boolean; reloadKey: number }) {
  const [state, setState] = useState<AvailLoadState>(
    hasProfile ? { kind: 'loading' } : { kind: 'ready', items: [] },
  );
  const [internalReload, setInternalReload] = useState(0);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<AvailabilityFormValues>(defaultAvailabilityForm);
  const [addError, setAddError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!hasProfile) {
      setState({ kind: 'ready', items: [] });
      return;
    }
    let cancelled = false;
    setState({ kind: 'loading' });
    fetch('/api/profiles/me/availability', {
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    })
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setState({ kind: 'error', message: await readError(res) });
          return;
        }
        const body = (await res.json()) as { availability: AvailabilityDTO[] };
        setState({ kind: 'ready', items: body.availability });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          kind: 'error',
          message: err instanceof Error ? err.message : 'Could not load availability.',
        });
      });
    return () => {
      cancelled = true;
    };
  }, [hasProfile, reloadKey, internalReload]);

  const onAdd = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (form.end_time <= form.start_time) {
      setAddError('End time must be after start time.');
      return;
    }
    setAdding(true);
    setAddError(null);
    try {
      const res = await fetch('/api/profiles/me/availability', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        setAddError(await readError(res));
        return;
      }
      setForm(defaultAvailabilityForm());
      setInternalReload((k) => k + 1);
    } catch (err: unknown) {
      setAddError(err instanceof Error ? err.message : 'Could not add availability.');
    } finally {
      setAdding(false);
    }
  };

  const onDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/profiles/me/availability/${id}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      if (!res.ok && res.status !== 204) {
        setAddError(await readError(res));
        return;
      }
      setInternalReload((k) => k + 1);
    } catch (err: unknown) {
      setAddError(err instanceof Error ? err.message : 'Could not remove availability.');
    } finally {
      setDeletingId(null);
    }
  };

  const formatTime = useCallback((t: string) => {
    // Strip trailing :00 seconds for display ("12:00:00" -> "12:00").
    return t.length > 5 ? t.slice(0, 5) : t;
  }, []);

  const dayLabel = useCallback((d: number) => DAY_LABELS[d] ?? `Day ${d}`, []);

  const showSkeleton = state.kind === 'loading';
  const items = state.kind === 'ready' ? state.items : [];

  return (
    <section className={styles.card}>
      <h2 className={styles.cardHeading}>Weekly availability</h2>
      <p className={styles.cardSubhead}>
        Recurring windows when you can meet a seeker. Add as many as you like.
      </p>

      {!hasProfile && (
        <StatusMessage tone="notice">
          Save your profile above first — availability windows attach to it.
        </StatusMessage>
      )}

      {hasProfile && state.kind === 'error' && (
        <div className={styles.statusBanner}>
          <StatusMessage tone="error">{state.message}</StatusMessage>
        </div>
      )}

      {hasProfile && (
        <>
          <div className={styles.availabilityList}>
            {showSkeleton && (
              <>
                <div className={styles.skeletonBar} />
                <div className={styles.skeletonBar} />
              </>
            )}
            {!showSkeleton && items.length === 0 && (
              <div className={styles.empty}>No availability windows yet. Add one below.</div>
            )}
            {!showSkeleton &&
              items.map((it) => (
                <div key={it.id} className={styles.availabilityItem}>
                  <div className={styles.availabilityMeta}>
                    <span>
                      <strong>{dayLabel(it.day_of_week)}</strong> {formatTime(it.start_time)} –{' '}
                      {formatTime(it.end_time)}
                    </span>
                    <span className={styles.availabilityMealType}>
                      {it.meal_type} · {it.timezone}
                    </span>
                  </div>
                  <button
                    type="button"
                    className={styles.danger}
                    onClick={() => onDelete(it.id)}
                    disabled={deletingId === it.id}
                    aria-label={`Remove ${dayLabel(it.day_of_week)} ${formatTime(
                      it.start_time,
                    )} window`}
                  >
                    {deletingId === it.id ? 'Removing...' : 'Remove'}
                  </button>
                </div>
              ))}
          </div>

          {addError && (
            <div className={styles.statusBanner}>
              <StatusMessage tone="error">{addError}</StatusMessage>
            </div>
          )}

          <form className={styles.form} onSubmit={onAdd} noValidate>
            <div className={styles.row}>
              <div className={styles.field}>
                <label htmlFor="day_of_week" className={styles.label}>
                  Day
                </label>
                <select
                  id="day_of_week"
                  className={styles.select}
                  value={form.day_of_week}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      day_of_week: Number(e.target.value),
                    }))
                  }
                  disabled={adding}
                >
                  {DAY_LABELS.map((label, idx) => (
                    <option key={label} value={idx}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.field}>
                <label htmlFor="meal_type" className={styles.label}>
                  Meal
                </label>
                <select
                  id="meal_type"
                  className={styles.select}
                  value={form.meal_type}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      meal_type: e.target.value as MealType,
                    }))
                  }
                  disabled={adding}
                >
                  {MEAL_TYPES.map((mt) => (
                    <option key={mt} value={mt}>
                      {mt === 'lunch' ? 'Lunch' : 'Dinner'}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className={styles.row}>
              <div className={styles.field}>
                <label htmlFor="start_time" className={styles.label}>
                  Starts
                </label>
                <input
                  id="start_time"
                  type="time"
                  className={styles.input}
                  value={form.start_time}
                  onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))}
                  disabled={adding}
                  required
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="end_time" className={styles.label}>
                  Ends
                </label>
                <input
                  id="end_time"
                  type="time"
                  className={styles.input}
                  value={form.end_time}
                  onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))}
                  disabled={adding}
                  required
                />
              </div>
            </div>

            <div className={styles.field}>
              <label htmlFor="timezone" className={styles.label}>
                Timezone
              </label>
              <input
                id="timezone"
                type="text"
                className={styles.input}
                value={form.timezone}
                onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
                disabled={adding}
              />
              <p className={styles.helpText}>IANA name, e.g. America/Los_Angeles.</p>
            </div>

            <div className={styles.actions}>
              <button type="submit" className={styles.primary} disabled={adding}>
                {adding ? 'Adding...' : 'Add window'}
              </button>
            </div>
          </form>
        </>
      )}
    </section>
  );
}
