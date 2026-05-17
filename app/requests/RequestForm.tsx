'use client';

// /requests - request-a-meal form.
//
// Fetches the chosen companion's public profile (and so the activities
// they offer) and lets the seeker propose a time + venue + budget +
// message. Submits to POST /api/requests when that endpoint exists;
// shows a clear "API not yet live" notice if it does not, so we can
// build and demo the screen ahead of the Core API agent.
//
// The companion id arrives as `?companion=<uuid>`. We re-fetch the
// public profile client-side rather than relying on a server prop so
// users who navigate from /companions/[id] do not have to wait for a
// second server render; the loading state covers the gap.

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ActivitySelector } from '@/components/activity';
import { Avatar, Button, Card, Input, LoadingBlock, Textarea } from '@/components/ui';
import { StatusMessage } from '@/components/StatusMessage';
import {
  ACTIVITY_TYPES,
  ACTIVITY_TYPE_META,
  BUDGET_TIERS,
  isActivityType,
  type ActivityType,
  type BudgetTier,
} from '@/lib/types';
import type { PublicCompanionProfileDTO } from '@/app/api/profiles/_lib/types';
import styles from './styles.module.css';

interface ApiErrorBody {
  error?: { code?: string; message?: string };
}

function todayLocal(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function combineDateTime(date: string, time: string): string | null {
  // Build a local-time ISO string. The user is picking a wall-clock
  // moment in their tz; we serialise via Date so the API gets a real
  // UTC ISO regardless of where the browser is.
  if (!date || !time) return null;
  const composed = new Date(`${date}T${time}`);
  if (Number.isNaN(composed.getTime())) return null;
  return composed.toISOString();
}

export function RequestForm() {
  const router = useRouter();
  const search = useSearchParams();
  const companionId = search.get('companion');
  const initialActivity = search.get('activity');

  const [profile, setProfile] = useState<PublicCompanionProfileDTO | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState<boolean>(Boolean(companionId));

  const [activity, setActivity] = useState<ActivityType | null>(
    isActivityType(initialActivity) ? initialActivity : null,
  );
  const [date, setDate] = useState(todayLocal());
  const [time, setTime] = useState('12:30');
  const [venueName, setVenueName] = useState('');
  const [venueLocation, setVenueLocation] = useState('');
  const [budget, setBudget] = useState<BudgetTier>('$$');
  const [message, setMessage] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [endpointMissing, setEndpointMissing] = useState(false);

  useEffect(() => {
    if (!companionId) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/profiles/${companionId}`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });
        if (cancelled) return;
        if (res.status === 404) {
          setProfileError('That companion is not available.');
          return;
        }
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as ApiErrorBody;
          throw new Error(body.error?.message ?? `Could not load companion (${res.status}).`);
        }
        const body = (await res.json()) as { profile: PublicCompanionProfileDTO };
        setProfile(body.profile);
      } catch (err) {
        if (cancelled) return;
        setProfileError(err instanceof Error ? err.message : 'Could not load companion.');
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [companionId]);

  const offeredActivities = useMemo<ActivityType[]>(() => {
    if (!profile) return [...ACTIVITY_TYPES];
    const offered = ACTIVITY_TYPES.filter((a) => profile.activities[a]);
    return offered.length > 0 ? offered : [...ACTIVITY_TYPES];
  }, [profile]);

  useEffect(() => {
    // If the selected activity is not offered by this companion, fall
    // back to the first activity they do offer so the form stays in a
    // valid state instead of letting the seeker submit a no-op.
    if (activity && !offeredActivities.includes(activity)) {
      setActivity(offeredActivities[0] ?? null);
    } else if (!activity && offeredActivities[0]) {
      setActivity(offeredActivities[0]);
    }
  }, [offeredActivities, activity]);

  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setSubmitError(null);
      setEndpointMissing(false);

      if (!companionId) {
        setSubmitError('No companion selected.');
        return;
      }
      if (!activity) {
        setSubmitError('Pick an activity.');
        return;
      }
      const proposedTime = combineDateTime(date, time);
      if (!proposedTime) {
        setSubmitError('Pick a valid date and time.');
        return;
      }

      setSubmitting(true);
      try {
        const res = await fetch('/api/requests', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            companion_id: companionId,
            activity_type: activity,
            proposed_time: proposedTime,
            venue_name: venueName || null,
            venue_location: venueLocation || null,
            budget_tier: budget,
            message: message || null,
          }),
        });
        if (res.status === 404) {
          setEndpointMissing(true);
          return;
        }
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as ApiErrorBody;
          throw new Error(body.error?.message ?? `Request failed (${res.status}).`);
        }
        const body = (await res.json()) as { request: { id: string } };
        router.push(`/requests/${body.request.id}`);
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : 'Could not send your request.');
      } finally {
        setSubmitting(false);
      }
    },
    [companionId, activity, date, time, venueName, venueLocation, budget, message, router],
  );

  if (!companionId) {
    return (
      <main className={styles.shell}>
        <header className={styles.header}>
          <h1 className={styles.title}>Request a meet</h1>
        </header>
        <div style={{ padding: '0 1.25rem' }}>
          <StatusMessage tone="notice">
            Pick a companion first. <Link href="/discover">Browse companions →</Link>
          </StatusMessage>
        </div>
      </main>
    );
  }

  if (profileLoading) {
    return (
      <main className={styles.shell}>
        <header className={styles.header}>
          <h1 className={styles.title}>Request a meet</h1>
        </header>
        <LoadingBlock label="Loading companion" />
      </main>
    );
  }

  if (profileError) {
    return (
      <main className={styles.shell}>
        <header className={styles.header}>
          <h1 className={styles.title}>Request a meet</h1>
        </header>
        <div style={{ padding: '0 1.25rem' }}>
          <StatusMessage tone="error">{profileError}</StatusMessage>
        </div>
      </main>
    );
  }

  const feeForActivity = activity && profile ? profile.rates[activity] : undefined;

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <h1 className={styles.title}>Request a meet</h1>
        <p className={styles.subtitle}>
          {profile
            ? `Send ${profile.name.split(' ')[0]} a request. They'll see your message and your proposed time.`
            : 'Send your request.'}
        </p>
      </header>

      {profile ? (
        <div className={styles.companionStrip}>
          <Avatar src={profile.photo_urls[0] ?? null} name={profile.name} size={48} />
          <div style={{ minWidth: 0 }}>
            <p className={styles.companionName}>{profile.name}</p>
            {profile.service_area ? (
              <p className={styles.companionMeta}>{profile.service_area}</p>
            ) : null}
          </div>
        </div>
      ) : null}

      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        {endpointMissing ? (
          <StatusMessage tone="notice">
            The requests API (<code>POST /api/requests</code>) is not live yet — wiring up Core API
            Phase 2 will turn this submit into a real request. Your filters and message are
            preserved.
          </StatusMessage>
        ) : null}
        {submitError ? <StatusMessage tone="error">{submitError}</StatusMessage> : null}

        <div className={styles.section}>
          <span className={styles.sectionLabel}>Activity</span>
          <ActivitySelector
            mode="single"
            value={activity}
            onChange={(next) => setActivity(next)}
            available={offeredActivities}
            showFeeHint
          />
        </div>

        <div className={styles.section}>
          <span className={styles.sectionLabel}>When</span>
          <div className={styles.dateRow}>
            <Input
              type="date"
              label={<span className="sr-only">Date</span>}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              min={todayLocal()}
              required
            />
            <Input
              type="time"
              label={<span className="sr-only">Time</span>}
              value={time}
              onChange={(e) => setTime(e.target.value)}
              required
            />
          </div>
        </div>

        <Input
          label="Venue name"
          help="Public venue only - café, restaurant, or bar."
          value={venueName}
          onChange={(e) => setVenueName(e.target.value)}
          placeholder={
            activity
              ? `e.g. ${
                  ACTIVITY_TYPE_META[activity].venue === 'cafe' ? 'Blue Bottle' : 'a local spot'
                }`
              : 'A public venue'
          }
        />

        <Input
          label="Neighborhood or address"
          help="Helps your companion confirm the spot works for them."
          optional
          value={venueLocation}
          onChange={(e) => setVenueLocation(e.target.value)}
          placeholder="e.g. Hayes Valley, San Francisco"
        />

        <div className={styles.section}>
          <span className={styles.sectionLabel}>Budget tier (your max for the activity bill)</span>
          <div className={styles.budgetRow} role="group" aria-label="Budget tier">
            {BUDGET_TIERS.map((tier) => (
              <button
                key={tier}
                type="button"
                className={styles.budgetButton}
                aria-pressed={budget === tier}
                onClick={() => setBudget(tier)}
              >
                {tier}
              </button>
            ))}
          </div>
        </div>

        <Textarea
          label="Message"
          optional
          rows={4}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Anything they should know - dietary needs, who you are, a topic you'd love to chat about."
        />

        {activity ? (
          <Card variant="flat" padded>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
              <span style={{ fontWeight: 600 }}>{ACTIVITY_TYPE_META[activity].label} fee</span>
              <span style={{ fontWeight: 700 }}>
                {feeForActivity !== undefined ? `$${feeForActivity}` : '—'}
              </span>
            </div>
            <p
              style={{
                margin: '0.5rem 0 0',
                fontSize: '0.8125rem',
                color: 'var(--color-text-secondary)',
              }}
            >
              You also cover the activity bill at the venue. The companion fee is held in escrow
              until after your meet.
            </p>
          </Card>
        ) : null}

        <div className={styles.stickyCta}>
          <Button type="submit" fullWidth loading={submitting}>
            Send request
          </Button>
        </div>
      </form>
    </main>
  );
}
