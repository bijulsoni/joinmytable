'use client';

// /discover - companion search.
//
// This is the client half of the screen. The server wrapper enforces
// auth; here we run filters and call the (forthcoming) Core API search
// endpoint. When the endpoint 404s in development we fall back to a
// clearly-labelled empty state so the rest of the screen still renders
// against the live filter state.
//
// Wire contract (planned):
//   GET /api/search/companions?lat&lng&activity_type&budget_tier&date
//   Response: { companions: CompanionSearchResultDTO[] }

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivitySelector } from '@/components/activity';
import { Avatar, Badge, Button, Card, EmptyState, LoadingBlock } from '@/components/ui';
import { StatusMessage } from '@/components/StatusMessage';
import {
  ACTIVITY_TYPE_META,
  BUDGET_TIERS,
  type ActivityType,
  type BudgetTier,
  type CompanionActivitiesMap,
  type CompanionRatesMap,
} from '@/lib/types';
import styles from './styles.module.css';

interface CompanionSearchResult {
  user_id: string;
  name: string;
  photo_url: string | null;
  rating_avg: string;
  review_count: number;
  /** Distance from the searcher's location, in km. Null when search ran without a location. */
  distance_km: number | null;
  /** Activity-keyed booleans (which activity types the companion offers). */
  activities: CompanionActivitiesMap;
  /** Activity-keyed whole-dollar rates. */
  rates: CompanionRatesMap;
  verified: boolean;
}

interface SearchResponse {
  companions: CompanionSearchResult[];
}

interface ApiErrorBody {
  error?: { code?: string; message?: string };
}

interface LocationState {
  status: 'idle' | 'requesting' | 'granted' | 'denied' | 'unavailable';
  lat?: number;
  lng?: number;
  message?: string;
}

const DEFAULT_ACTIVITY: ActivityType = 'lunch';

function todayLocal(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function DiscoverClient() {
  const [activity, setActivity] = useState<ActivityType>(DEFAULT_ACTIVITY);
  const [date, setDate] = useState<string>(todayLocal());
  const [time, setTime] = useState<string>('12:30');
  const [budget, setBudget] = useState<BudgetTier>('$$');
  const [location, setLocation] = useState<LocationState>({ status: 'idle' });
  const [results, setResults] = useState<CompanionSearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [endpointMissing, setEndpointMissing] = useState(false);

  const requestLocation = useCallback(() => {
    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      setLocation({ status: 'unavailable', message: 'Location is not supported on this device.' });
      return;
    }
    setLocation({ status: 'requesting' });
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          status: 'granted',
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      (err) => {
        setLocation({
          status: 'denied',
          message:
            err.code === err.PERMISSION_DENIED
              ? 'Location permission denied. You can still search without it.'
              : 'Could not read your location. Search will run without it.',
        });
      },
      { enableHighAccuracy: false, maximumAge: 5 * 60 * 1000, timeout: 8000 },
    );
  }, []);

  const runSearch = useCallback(async () => {
    setLoading(true);
    setError(null);
    setEndpointMissing(false);
    try {
      const params = new URLSearchParams({
        activity_type: activity,
        budget_tier: budget,
        date,
        time,
      });
      if (
        location.status === 'granted' &&
        location.lat !== undefined &&
        location.lng !== undefined
      ) {
        params.set('lat', String(location.lat));
        params.set('lng', String(location.lng));
      }
      const res = await fetch(`/api/search/companions?${params.toString()}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (res.status === 404) {
        // Core API search endpoint is planned for Phase 2; show a
        // dedicated empty state rather than a generic error so the
        // Frontend screen stays useful in the meantime.
        setEndpointMissing(true);
        setResults([]);
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as ApiErrorBody;
        throw new Error(body.error?.message ?? `Search failed (${res.status}).`);
      }
      const body = (await res.json()) as SearchResponse;
      setResults(body.companions ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed.');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [activity, budget, date, time, location]);

  useEffect(() => {
    // Run a search on mount + whenever any filter changes. Location is
    // intentionally not a hard requirement so the screen is usable on
    // desktop / when permission is denied.
    void runSearch();
  }, [runSearch]);

  const locationLabel = useMemo(() => {
    switch (location.status) {
      case 'idle':
        return 'Not shared yet — tap to use your location.';
      case 'requesting':
        return 'Asking for location…';
      case 'granted':
        return `Using your current location (${location.lat?.toFixed(2)}, ${location.lng?.toFixed(2)})`;
      case 'denied':
        return location.message ?? 'Location denied — searching without distance.';
      case 'unavailable':
        return location.message ?? 'Location not available on this device.';
    }
  }, [location]);

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <h1 className={styles.title}>Discover</h1>
        <p className={styles.subtitle}>Find a verified companion near you.</p>
      </header>

      <section className={styles.filters} aria-labelledby="filters-heading">
        <h2 id="filters-heading" className="sr-only" style={{ position: 'absolute', left: -9999 }}>
          Filters
        </h2>

        <Card variant="flat" className={styles.locationBar} as="div">
          <span className={styles.locationText}>
            <span>Location</span>
            <span className={styles.locationCaption}>{locationLabel}</span>
          </span>
          <Button
            variant={location.status === 'granted' ? 'secondary' : 'primary'}
            onClick={requestLocation}
            loading={location.status === 'requesting'}
          >
            {location.status === 'granted' ? 'Refresh' : 'Use my location'}
          </Button>
        </Card>

        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>Activity</span>
          <ActivitySelector
            mode="single"
            value={activity}
            onChange={(next) => {
              if (next) setActivity(next);
            }}
          />
        </div>

        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>When</span>
          <div className={styles.dateRow}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <span className="sr-only">Date</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                min={todayLocal()}
                style={{
                  appearance: 'none',
                  border: '1px solid var(--color-border-strong)',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.75rem',
                  fontSize: '1rem',
                  minHeight: 48,
                  background: 'var(--color-surface)',
                }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <span className="sr-only">Time</span>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                style={{
                  appearance: 'none',
                  border: '1px solid var(--color-border-strong)',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.75rem',
                  fontSize: '1rem',
                  minHeight: 48,
                  background: 'var(--color-surface)',
                }}
              />
            </label>
          </div>
        </div>

        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>Budget tier (activity cost)</span>
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
      </section>

      <section className={styles.results} aria-live="polite">
        {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}

        {loading && !results ? (
          <>
            <div className={styles.skeleton} />
            <div className={styles.skeleton} />
            <div className={styles.skeleton} />
          </>
        ) : null}

        {!loading && results && results.length === 0 ? (
          endpointMissing ? (
            <EmptyState
              title="Discovery is not live yet"
              action={
                <Button as={Link} href="/companions" variant="secondary">
                  Browse anyway
                </Button>
              }
            >
              The companion search API is still being built by the Core API agent. Filters work —
              results will appear once <code>/api/search/companions</code> is wired up.
            </EmptyState>
          ) : (
            <EmptyState title="No companions match these filters">
              Try a different time, activity, or budget tier.
            </EmptyState>
          )
        ) : null}

        {!loading && results && results.length > 0
          ? results.map((c) => <CompanionResultCard key={c.user_id} companion={c} />)
          : null}
      </section>
    </main>
  );
}

function CompanionResultCard({ companion }: { companion: CompanionSearchResult }) {
  const offered = (Object.entries(companion.activities) as [ActivityType, boolean][])
    .filter(([, on]) => on)
    .map(([a]) => a);

  // Whole card is the link target. Inner "Request →" affordance is a
  // visual cue rather than a nested interactive element (browsers do not
  // allow buttons inside anchors, and nesting links breaks a11y).
  return (
    <Card as={Link} href={`/companions/${companion.user_id}`} shadow>
      <div className={styles.resultCard}>
        <Avatar src={companion.photo_url} name={companion.name} size={64} />
        <div className={styles.resultBody}>
          <h3 className={styles.resultName}>
            {companion.name}
            {companion.verified ? (
              <span className={styles.verified} aria-label="Verified">
                ✓
              </span>
            ) : null}
          </h3>
          <p className={styles.resultMeta}>
            ★ {Number(companion.rating_avg).toFixed(1)} · {companion.review_count} reviews
            {companion.distance_km !== null ? ` · ${companion.distance_km.toFixed(1)} km` : ''}
          </p>
          <div className={styles.rates}>
            {offered.map((activity) => {
              const rate = companion.rates[activity];
              return (
                <Badge key={activity} activity={activity}>
                  {ACTIVITY_TYPE_META[activity].label}
                  {rate !== undefined ? ` · $${rate}` : ''}
                </Badge>
              );
            })}
          </div>
        </div>
        <span aria-hidden style={{ color: 'var(--color-text-secondary)', fontSize: '1.25rem' }}>
          ›
        </span>
      </div>
    </Card>
  );
}
