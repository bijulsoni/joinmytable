'use client';

// Discover feed.
//
// SSR seeds the list with an unfiltered set of verified companions so
// the page paints fast and so harnesses (which don't run JS) see real
// cards. On mount the client asks for geolocation; if granted it
// re-fetches /api/search/companions?lat=&lng=&radius_km= and replaces
// the list with proximity-filtered, distance-sorted results.
//
// If geolocation is denied or unavailable, we keep the server seed and
// show a "browsing everywhere" notice so the seeker knows why an LA
// companion is showing up when they live in Seattle.
//
// Radius (in miles, US-centric) is user-controlled — pill selector with
// 5 / 10 / 25 / 50 / 100 mi options. Default 50. Persisted in
// localStorage so future visits remember the pick.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui';
import { ActivityIcon } from '@/components/activity';
import { ACTIVITY_TYPE_META, ACTIVITY_TYPES, type ActivityType } from '@/lib/types';
import styles from './styles.module.css';

export interface FeedCompanion {
  user_id: string;
  name: string;
  bio: string | null;
  service_area: string | null;
  photo_url: string | null;
  rating_avg: number | null;
  activities: ActivityType[];
  rates: Partial<Record<ActivityType, number>>;
  verified: boolean;
  /** Distance from the seeker's current location, when known. */
  distance_km?: number | null;
}

interface Props {
  companions: FeedCompanion[];
  fetchError: string | null;
}

const RADIUS_OPTIONS_MI = [5, 10, 25, 50, 100] as const;
type RadiusMi = (typeof RADIUS_OPTIONS_MI)[number];
const DEFAULT_RADIUS_MI: RadiusMi = 50;
const RADIUS_STORAGE_KEY = 'jmt-discover-radius-mi';
const LOCATION_CACHE_KEY = 'konnly-discover-loc-v1';
const LOCATION_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const MI_TO_KM = 1.609344;

function readStoredRadius(): RadiusMi {
  if (typeof window === 'undefined') return DEFAULT_RADIUS_MI;
  try {
    const raw = window.localStorage.getItem(RADIUS_STORAGE_KEY);
    const n = raw ? Number(raw) : NaN;
    if ((RADIUS_OPTIONS_MI as readonly number[]).includes(n)) return n as RadiusMi;
  } catch {
    // ignored: privacy mode etc.
  }
  return DEFAULT_RADIUS_MI;
}

interface CachedLocation {
  lat: number;
  lng: number;
  ts: number;
}

function readCachedLocation(): CachedLocation | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LOCATION_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedLocation;
    if (
      typeof parsed?.lat !== 'number' ||
      typeof parsed?.lng !== 'number' ||
      typeof parsed?.ts !== 'number'
    ) {
      return null;
    }
    if (Date.now() - parsed.ts > LOCATION_CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCachedLocation(lat: number, lng: number): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: CachedLocation = { lat, lng, ts: Date.now() };
    window.localStorage.setItem(LOCATION_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // ignored
  }
}

// Haversine — meters between two lat/lng pairs. Used to decide whether
// a fresh GPS fix differs enough from the cached coords to bother
// refetching. Below ~2 mi we keep the cached fetch and don't flicker.
function metersBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

function formatDistance(km: number | null | undefined): string | null {
  if (km === null || km === undefined) return null;
  const mi = km / MI_TO_KM;
  if (mi < 0.5) return 'Less than ½ mi away';
  if (mi < 10) return `${mi.toFixed(1)} mi away`;
  return `${Math.round(mi)} mi away`;
}

type LocationState =
  | { status: 'idle' }
  | { status: 'requesting' }
  | { status: 'granted'; lat: number; lng: number }
  | { status: 'denied'; reason: string }
  | { status: 'unsupported' };

export function DiscoverFeed({ companions: seedCompanions, fetchError: seedError }: Props) {
  // Why so many states: we want the user to NEVER see the unfiltered
  // SSR seed flash on top before the geo-filtered list lands. Previous
  // behavior was an LA visitor seeing the Seattle seeded set for ~1s
  // before "no matches" snapped in. Now:
  //   - first paint: seedCompanions render dimmed with an overlay
  //   - return visitor (location cached): fetch fires immediately with
  //     cached coords, list paints within ~200ms
  //   - first-ever visitor: dimmed overlay until first fetch resolves
  const [companions, setCompanions] = useState<FeedCompanion[]>(seedCompanions);
  const [fetchError, setFetchError] = useState<string | null>(seedError);
  const [location, setLocation] = useState<LocationState>({ status: 'idle' });
  const [radiusMi, setRadiusMi] = useState<RadiusMi>(DEFAULT_RADIUS_MI);
  const [refreshing, setRefreshing] = useState(false);
  // True until the first geo-filtered (or no-geo fallback) fetch lands.
  // Used to dim the seed list + show "Finding companions near you…"
  // overlay so the LA→0 flash never appears.
  const [firstFetchPending, setFirstFetchPending] = useState(true);

  // Client-side filters layered on top of the geo-filtered server set.
  const [activityFilter, setActivityFilter] = useState<ActivityType | null>(null);
  const [areaQuery, setAreaQuery] = useState('');

  // Track which fetch was kicked off by the cached-location fast path
  // vs. the fresh GPS path, so a slow fresh-GPS callback can't override
  // an already-served cached fetch unnecessarily.
  const lastFetchedCoords = useRef<{ lat: number; lng: number } | null>(null);

  const fetchFiltered = useCallback(async (lat: number, lng: number, radiusKm: number) => {
    setRefreshing(true);
    setFetchError(null);
    lastFetchedCoords.current = { lat, lng };
    try {
      const params = new URLSearchParams({
        lat: String(lat),
        lng: String(lng),
        radius_km: String(radiusKm),
        limit: '60',
      });
      const res = await fetch(`/api/search/companions?${params.toString()}`, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        throw new Error(body.error?.message ?? `Search failed (${res.status}).`);
      }
      const body = (await res.json()) as { companions: FeedCompanion[] };
      setCompanions(body.companions ?? []);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Could not refresh nearby companions.');
    } finally {
      setRefreshing(false);
      setFirstFetchPending(false);
    }
  }, []);

  // Mount: hydrate radius preference, then race the cached-location
  // fast path against a fresh geolocation request.
  useEffect(() => {
    const storedRadius = readStoredRadius();
    setRadiusMi(storedRadius);

    const cached = readCachedLocation();
    if (cached) {
      // Fast path: paint filtered immediately using yesterday's coords.
      // Avoids the seed-flash flicker entirely for return visitors.
      setLocation({ status: 'granted', lat: cached.lat, lng: cached.lng });
      void fetchFiltered(cached.lat, cached.lng, storedRadius * MI_TO_KM);
    }

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      if (!cached) {
        setLocation({ status: 'unsupported' });
        setFirstFetchPending(false);
      }
      return;
    }

    if (!cached) {
      setLocation({ status: 'requesting' });
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const fresh = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        writeCachedLocation(fresh.lat, fresh.lng);
        setLocation({ status: 'granted', ...fresh });
        // If the fresh fix is meaningfully far from what we already
        // fetched with (e.g. user opened the app from a new city), do
        // another fetch. Below ~2 mi we don't bother — the result set
        // is the same and the network call would just cause a flicker.
        const prior = lastFetchedCoords.current;
        const needsRefetch = !prior || metersBetween(prior, fresh) > 3200; // ~2 mi
        if (needsRefetch) {
          void fetchFiltered(fresh.lat, fresh.lng, storedRadius * MI_TO_KM);
        }
      },
      (err) => {
        if (!cached) {
          setLocation({ status: 'denied', reason: err.message || 'Location unavailable.' });
          setFirstFetchPending(false);
        }
        // If we had cached coords we just keep using them; the fresh
        // denial isn't worth flipping the UI back to the no-geo state.
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60_000 },
    );
  }, [fetchFiltered]);

  // Radius-change-driven refetch (separate from the initial mount race
  // above so radius changes don't trigger geolocation requests).
  useEffect(() => {
    if (location.status !== 'granted') return;
    if (firstFetchPending) return; // initial fetch handles the first round
    void fetchFiltered(location.lat, location.lng, radiusMi * MI_TO_KM);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radiusMi]);

  const handleRadiusChange = useCallback((next: RadiusMi) => {
    setRadiusMi(next);
    try {
      window.localStorage.setItem(RADIUS_STORAGE_KEY, String(next));
    } catch {
      // localStorage may be unavailable (privacy mode).
    }
  }, []);

  const filtered = useMemo(() => {
    return companions.filter((c) => {
      if (activityFilter && !c.activities.includes(activityFilter)) return false;
      if (
        areaQuery.trim() &&
        !(c.service_area ?? '').toLowerCase().includes(areaQuery.trim().toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [companions, activityFilter, areaQuery]);

  const total = companions.length;

  return (
    <div className={styles.feedShell}>
      <header className={styles.feedHero}>
        <div className={styles.heroEyebrow}>
          <span className={styles.heroEyebrowDot} />
          {location.status === 'requesting'
            ? 'Finding companions near you…'
            : location.status === 'granted'
              ? `${total} companion${total === 1 ? '' : 's'} within ${radiusMi} mi`
              : `${total} verified companion${total === 1 ? '' : 's'} ready to share a table`}
        </div>
        <h1 className={styles.heroTitle}>
          Find your <span className={styles.heroTitleAccent}>table&nbsp;mate</span>.
        </h1>
        <p className={styles.heroLede}>
          Browse companions near you. Tap into a profile to see their full availability, rates, and
          send a request.
        </p>
      </header>

      {location.status === 'denied' || location.status === 'unsupported' ? (
        <div className={styles.locationNotice} role="status">
          <span aria-hidden>📍</span>
          <span>
            Showing companions <strong>everywhere</strong>.{' '}
            {location.status === 'denied'
              ? 'Allow location in your browser to see only people near you.'
              : 'Your browser doesn’t support location.'}
          </span>
        </div>
      ) : null}

      {location.status === 'granted' ? (
        <section className={styles.radiusSlider} aria-label="Search radius">
          <div className={styles.radiusSliderHead}>
            <span className={styles.radiusSliderLabel}>Within</span>
            <span className={styles.radiusSliderValue}>{radiusMi} mi</span>
          </div>
          <div
            className={styles.radiusSliderTrack}
            style={
              {
                ['--radius-progress' as string]: `${
                  (RADIUS_OPTIONS_MI.indexOf(radiusMi) / (RADIUS_OPTIONS_MI.length - 1)) * 100
                }%`,
              } as React.CSSProperties
            }
          >
            <input
              type="range"
              min={0}
              max={RADIUS_OPTIONS_MI.length - 1}
              step={1}
              value={RADIUS_OPTIONS_MI.indexOf(radiusMi)}
              onChange={(e) => {
                const next = RADIUS_OPTIONS_MI[Number(e.target.value)];
                if (next !== undefined) handleRadiusChange(next);
              }}
              disabled={refreshing}
              aria-label="Search radius in miles"
              aria-valuetext={`${radiusMi} miles`}
              className={styles.radiusSliderInput}
            />
            <div className={styles.radiusSliderDots} aria-hidden>
              {RADIUS_OPTIONS_MI.map((mi) => (
                <span
                  key={mi}
                  className={`${styles.radiusSliderDot} ${
                    mi === radiusMi ? styles.radiusSliderDotActive : ''
                  }`}
                >
                  <span className={styles.radiusSliderDotNum}>{mi}</span>
                  <span className={styles.radiusSliderDotUnit}>mi</span>
                </span>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <label className={styles.areaSearch} htmlFor="discover-area">
        <span className={styles.areaSearchIcon} aria-hidden>
          📍
        </span>
        <input
          id="discover-area"
          type="text"
          className={styles.areaSearchInput}
          placeholder="Filter by neighborhood — Kirkland, Bellevue, Seattle…"
          value={areaQuery}
          onChange={(e) => setAreaQuery(e.target.value)}
          autoComplete="off"
        />
        {areaQuery ? (
          <button
            type="button"
            className={styles.areaSearchClear}
            onClick={() => setAreaQuery('')}
            aria-label="Clear area filter"
          >
            ✕
          </button>
        ) : null}
      </label>

      <section className={styles.activityRail} aria-label="Filter by activity">
        <button
          type="button"
          className={`${styles.chip} ${activityFilter === null ? styles.chipActive : ''}`}
          aria-pressed={activityFilter === null}
          onClick={() => setActivityFilter(null)}
        >
          All activities
        </button>
        {ACTIVITY_TYPES.map((a) => (
          <button
            key={a}
            type="button"
            data-activity={a}
            className={`${styles.chip} ${activityFilter === a ? styles.chipActive : ''}`}
            aria-pressed={activityFilter === a}
            onClick={() => setActivityFilter(activityFilter === a ? null : a)}
          >
            <ActivityIcon activity={a} width={16} height={16} />
            {ACTIVITY_TYPE_META[a].label}
          </button>
        ))}
      </section>

      {fetchError ? (
        <div className={styles.errorBanner}>
          We couldn&apos;t load companions just now. {fetchError}
        </div>
      ) : null}

      {firstFetchPending ? (
        <div className={styles.locatingOverlay} role="status" aria-live="polite">
          <span className={styles.locatingSpinner} aria-hidden />
          <span>Finding companions near you…</span>
        </div>
      ) : null}

      {!firstFetchPending && filtered.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon} aria-hidden>
            ☕
          </div>
          <h2 className={styles.emptyTitle}>
            {location.status === 'granted'
              ? `No companions within ${radiusMi} mi`
              : 'No companions match these filters'}
          </h2>
          <p className={styles.emptyText}>
            {location.status === 'granted'
              ? 'Try widening the radius or clearing the activity filter.'
              : 'Try a different activity or clear the area filter.'}
          </p>
          <button
            type="button"
            className={styles.emptyResetButton}
            onClick={() => {
              setActivityFilter(null);
              setAreaQuery('');
              if (location.status === 'granted') handleRadiusChange(100);
            }}
          >
            Reset filters
          </button>
        </div>
      ) : filtered.length > 0 ? (
        <ul
          className={[styles.grid, firstFetchPending ? styles.gridDimmed : '']
            .filter(Boolean)
            .join(' ')}
          aria-busy={firstFetchPending}
        >
          {filtered.map((c) => {
            const distanceLabel = formatDistance(c.distance_km);
            return (
              <li key={c.user_id} className={styles.cardItem}>
                <Link
                  href={`/companions/${c.user_id}`}
                  className={styles.card}
                  aria-label={`${c.name}'s profile`}
                >
                  <div className={styles.cardPhoto}>
                    {c.photo_url ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={c.photo_url} alt="" className={styles.cardImg} />
                    ) : (
                      <div
                        className={styles.cardInitials}
                        data-activity={c.activities[0] ?? 'lunch'}
                        aria-hidden
                      >
                        {initials(c.name)}
                      </div>
                    )}
                    {c.verified ? (
                      <span className={styles.verifiedBadge} title="Verified">
                        ✓ Verified
                      </span>
                    ) : null}
                  </div>
                  <div className={styles.cardBody}>
                    <h3 className={styles.cardName}>{c.name}</h3>
                    {c.service_area ? (
                      <p className={styles.cardArea}>
                        <span aria-hidden>📍</span> {c.service_area}
                        {distanceLabel ? (
                          <span className={styles.cardDistance}> · {distanceLabel}</span>
                        ) : null}
                      </p>
                    ) : null}
                    {c.bio ? <p className={styles.cardBio}>{c.bio}</p> : null}
                    <div className={styles.cardActivities}>
                      {c.activities.map((a) => (
                        <Badge key={a} activity={a}>
                          {ACTIVITY_TYPE_META[a].label}
                          {c.rates[a] !== undefined ? ` · $${c.rates[a]}` : ''}
                        </Badge>
                      ))}
                    </div>
                    {c.rating_avg !== null && c.rating_avg > 0 ? (
                      <p className={styles.cardRating}>
                        <span className={styles.starFilled} aria-hidden>
                          ★
                        </span>
                        {c.rating_avg.toFixed(1)}
                      </p>
                    ) : null}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
