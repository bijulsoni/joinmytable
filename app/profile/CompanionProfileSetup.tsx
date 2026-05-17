'use client';

// Companion profile setup — aligned with the phase-1 v2 schema.
//
// Wired to the Core API contract under /app/api/profiles. Reads & writes:
//   - bio (text)
//   - service_area (text)
//   - activities (jsonb: Record<ActivityType, boolean>)
//   - rates (jsonb: Record<ActivityType, number>)  // dollars per session
//   - photo_urls (text[]) — read-only here
//
// Availability windows use the new free-form shape: day_or_date +
// time_range + activity_types[].

import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
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

interface ProfileDTO {
  id?: string;
  bio?: string | null;
  service_area?: string | null;
  activities?: Partial<Record<ActivityType, boolean>>;
  rates?: Partial<Record<ActivityType, number>>;
  photo_urls?: string[];
  account_verification_status?: 'unverified' | 'pending' | 'verified';
}

interface AvailabilityDTO {
  id: string;
  day_or_date: string;
  time_range: string;
  activity_types: ActivityType[];
}

interface FormValues {
  bio: string;
  service_area: string;
  activities: Record<ActivityType, boolean>;
  rates: Record<ActivityType, string>; // strings so the inputs are uncontrolled-friendly
}

function blankForm(): FormValues {
  return {
    bio: '',
    service_area: '',
    activities: { lunch: true, dinner: true, coffee: false, happy_hour: false },
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
  return {
    bio: dto.bio ?? '',
    service_area: dto.service_area ?? '',
    activities: ACTIVITY_TYPES.reduce(
      (acc, a) => {
        acc[a] = Boolean(dto.activities?.[a]);
        return acc;
      },
      { ...base.activities },
    ),
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

export function CompanionProfileSetup() {
  const [profile, setProfile] = useState<ProfileDTO | null>(null);
  const [form, setForm] = useState<FormValues>(blankForm);
  const [availability, setAvailability] = useState<AvailabilityDTO[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<
    | { status: 'idle' }
    | { status: 'saving' }
    | { status: 'ok' }
    | { status: 'error'; message: string }
  >({ status: 'idle' });

  const loadProfile = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch('/api/profiles/me', { cache: 'no-store' });
      if (res.status === 404) {
        setProfile({});
        setForm(blankForm());
      } else if (!res.ok) {
        setLoadError(await readError(res));
        return;
      } else {
        const data = (await res.json()) as ProfileDTO;
        setProfile(data);
        setForm(dtoToForm(data));
      }
      const availRes = await fetch('/api/profiles/me/availability', { cache: 'no-store' });
      if (availRes.ok) {
        const av = (await availRes.json()) as { availability?: AvailabilityDTO[] };
        setAvailability(av.availability ?? []);
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load profile.');
    }
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaveStatus({ status: 'saving' });

    const rates: Partial<Record<ActivityType, number>> = {};
    for (const a of ACTIVITY_TYPES) {
      if (!form.activities[a]) continue;
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

    const activities = ACTIVITY_TYPES.reduce<Partial<Record<ActivityType, boolean>>>((acc, a) => {
      acc[a] = form.activities[a];
      return acc;
    }, {});

    if (!ACTIVITY_TYPES.some((a) => activities[a])) {
      setSaveStatus({ status: 'error', message: 'Select at least one activity.' });
      return;
    }

    try {
      const res = await fetch('/api/profiles/me', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          bio: form.bio.trim() || null,
          service_area: form.service_area.trim() || null,
          activities,
          rates,
        }),
      });
      if (!res.ok) {
        setSaveStatus({ status: 'error', message: await readError(res) });
        return;
      }
      const updated = (await res.json()) as ProfileDTO;
      setProfile(updated);
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

  return (
    <form className={styles.card} onSubmit={onSubmit}>
      <h2 className={styles.cardHeading}>About you</h2>
      <label className={styles.label} htmlFor="bio">
        Bio
      </label>
      <textarea
        id="bio"
        className={styles.input}
        rows={4}
        maxLength={4000}
        value={form.bio}
        onChange={(e) => setForm({ ...form, bio: e.target.value })}
        placeholder="Tell seekers a little about you."
      />

      <label className={styles.label} htmlFor="service_area">
        Service area
      </label>
      <input
        id="service_area"
        className={styles.input}
        type="text"
        maxLength={200}
        value={form.service_area}
        onChange={(e) => setForm({ ...form, service_area: e.target.value })}
        placeholder="e.g. Downtown San Francisco"
      />

      <div className={styles.divider} />

      <h2 className={styles.cardHeading}>Activities & rates</h2>
      <p className={styles.helpText}>
        Pick the activities you&apos;ll host and set your companionship fee for each. Seekers also
        cover the activity cost.
      </p>

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
                  ({meta.suggestedFeeUsd.min}–{meta.suggestedFeeUsd.max} suggested)
                </span>
              </label>
              {enabled && (
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
              )}
            </div>
          );
        })}
      </div>

      <div className={styles.divider} />

      <h2 className={styles.cardHeading}>Availability</h2>
      {availability === null ? (
        <p className={styles.helpText}>Loading availability…</p>
      ) : availability.length === 0 ? (
        <p className={styles.helpText}>No availability windows yet.</p>
      ) : (
        <ul className={styles.availabilityList}>
          {availability.map((w) => (
            <li key={w.id} className={styles.availabilityRow}>
              <strong>{w.day_or_date}</strong> · {w.time_range}
              <span className={styles.helpText}>
                {' '}
                — {w.activity_types.map((t) => ACTIVITY_TYPE_META[t]?.label ?? t).join(', ')}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className={styles.helpText}>
        Availability editing is coming in the next phase. Use the API directly for now.
      </p>

      <div className={styles.divider} />

      <h2 className={styles.cardHeading}>Verification</h2>
      <p className={styles.helpText}>
        Verification status: <strong>{profile.account_verification_status ?? 'unverified'}</strong>.{' '}
        <Link href="/verify">
          {profile.account_verification_status === 'verified' ? 'Manage' : 'Start verification'}
        </Link>
      </p>

      <div className={styles.divider} />

      {saveStatus.status === 'error' && <div className={styles.error}>{saveStatus.message}</div>}
      {saveStatus.status === 'ok' && <div className={styles.success}>Saved.</div>}

      <button type="submit" className={styles.primary} disabled={saveStatus.status === 'saving'}>
        {saveStatus.status === 'saving' ? 'Saving…' : 'Save changes'}
      </button>
    </form>
  );
}
