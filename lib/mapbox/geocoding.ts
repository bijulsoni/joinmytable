// Server-side Mapbox Geocoding (v6) helpers.
//
// All exports follow the same failure contract: on any error (missing
// token, network failure, non-2xx response, malformed payload) the
// function logs and returns the "empty" value for its return type
// (null, null, or []). Never throws.
//
// Token resolution order:
//   1. MAPBOX_SECRET_TOKEN  (server-only, preferred)
//   2. NEXT_PUBLIC_MAPBOX_TOKEN  (public token, also valid for geocoding)
//
// Without either, every helper short-circuits to its empty value.

import { logger } from '@/lib/logger';
import type { ActivityType } from '@/lib/types';
import type { Venue, VenueCategory } from './types';

const log = logger.child({ module: 'mapbox/geocoding' });

const GEOCODE_BASE = 'https://api.mapbox.com/search/geocode/v6';

/**
 * Activity → Mapbox POI category mapping (CLAUDE.md core product rule #2:
 * all activities happen in public venues). Mapbox v6 supports comma-
 * separated `poi_category` values; we pass the broadest set that still
 * matches CLAUDE.md's venue-type column for each activity.
 */
const ACTIVITY_TO_POI_CATEGORIES: Readonly<Record<ActivityType, readonly string[]>> = {
  coffee: ['cafe', 'coffee_shop'],
  lunch: ['restaurant', 'food'],
  dinner: ['restaurant', 'food'],
  happy_hour: ['bar', 'restaurant', 'pub'],
} as const;

/** Maps Mapbox POI category labels onto our narrow `VenueCategory` union. */
function classifyCategory(rawCategories: readonly string[]): VenueCategory {
  const set = new Set(rawCategories.map((c) => c.toLowerCase()));
  if (set.has('cafe') || set.has('coffee_shop') || set.has('coffee') || set.has('tea')) {
    return 'cafe';
  }
  if (set.has('bar') || set.has('pub') || set.has('nightlife')) {
    return 'bar';
  }
  return 'restaurant';
}

function readToken(): string | null {
  const token = process.env.MAPBOX_SECRET_TOKEN ?? process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';
  return token.length > 0 ? token : null;
}

async function fetchMapbox(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) {
      log.warn({ status: res.status, url: stripToken(url) }, 'mapbox non-2xx response');
      return null;
    }
    return (await res.json()) as unknown;
  } catch (err) {
    log.warn({ err, url: stripToken(url) }, 'mapbox fetch failed');
    return null;
  }
}

function stripToken(url: string): string {
  return url.replace(/access_token=[^&]+/, 'access_token=[redacted]');
}

// ---------------------------------------------------------------------------
// Geocoding API v6 response shapes (minimal — only what we read)
// ---------------------------------------------------------------------------

interface MapboxFeature {
  id?: string;
  type?: string;
  geometry?: { type?: string; coordinates?: [number, number] };
  properties?: {
    mapbox_id?: string;
    name?: string;
    full_address?: string;
    place_formatted?: string;
    feature_type?: string;
    poi_category?: string[];
  };
}

interface MapboxFeatureCollection {
  type?: string;
  features?: MapboxFeature[];
}

function isFeatureCollection(value: unknown): value is MapboxFeatureCollection {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as { features?: unknown }).features)
  );
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/**
 * Convert an address string to coordinates using Mapbox Geocoding v6 forward.
 * Returns null on any failure (no token, no result, network/HTTP error).
 */
export async function geocodeAddress(
  address: string,
): Promise<{ lat: number; lng: number } | null> {
  const trimmed = address.trim();
  if (trimmed.length === 0) return null;

  const token = readToken();
  if (token === null) {
    log.debug('geocodeAddress: mapbox token unset');
    return null;
  }

  const url =
    `${GEOCODE_BASE}/forward?q=${encodeURIComponent(trimmed)}` +
    `&limit=1&access_token=${encodeURIComponent(token)}`;

  const payload = await fetchMapbox(url);
  if (!isFeatureCollection(payload)) return null;

  const feature = payload.features?.[0];
  const coords = feature?.geometry?.coordinates;
  if (!coords || coords.length !== 2) return null;

  const [lng, lat] = coords;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

/**
 * Reverse geocode: coordinates → human-readable address.
 * Returns null on any failure or if no readable address is produced.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const token = readToken();
  if (token === null) {
    log.debug('reverseGeocode: mapbox token unset');
    return null;
  }

  const url =
    `${GEOCODE_BASE}/reverse?longitude=${lng}&latitude=${lat}` +
    `&limit=1&access_token=${encodeURIComponent(token)}`;

  const payload = await fetchMapbox(url);
  if (!isFeatureCollection(payload)) return null;

  const props = payload.features?.[0]?.properties;
  const address = props?.full_address ?? props?.place_formatted ?? props?.name ?? null;
  return typeof address === 'string' && address.length > 0 ? address : null;
}

/**
 * Search for venues near (lat, lng) restricted to the categories appropriate
 * for the given activity type (see ACTIVITY_TO_POI_CATEGORIES above).
 * Returns [] on any failure. Caller is responsible for trimming the query.
 */
export async function searchVenues(
  query: string,
  lat: number,
  lng: number,
  activityType: ActivityType,
): Promise<Venue[]> {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];

  const token = readToken();
  if (token === null) {
    log.debug('searchVenues: mapbox token unset');
    return [];
  }

  const categories = ACTIVITY_TO_POI_CATEGORIES[activityType];
  const url =
    `${GEOCODE_BASE}/forward?q=${encodeURIComponent(trimmed)}` +
    `&proximity=${lng},${lat}` +
    `&types=poi` +
    `&poi_category=${encodeURIComponent(categories.join(','))}` +
    `&limit=10` +
    `&access_token=${encodeURIComponent(token)}`;

  const payload = await fetchMapbox(url);
  if (!isFeatureCollection(payload)) return [];

  const features = payload.features ?? [];
  const venues: Venue[] = [];
  for (const feature of features) {
    const venue = toVenue(feature);
    if (venue !== null) venues.push(venue);
  }
  return venues;
}

function toVenue(feature: MapboxFeature): Venue | null {
  const coords = feature.geometry?.coordinates;
  if (!coords || coords.length !== 2) return null;
  const [lng, lat] = coords;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const props = feature.properties ?? {};
  const mapboxId = props.mapbox_id ?? feature.id ?? null;
  if (mapboxId === null) return null;

  const name = props.name ?? null;
  if (name === null || name.length === 0) return null;

  const address = props.full_address ?? props.place_formatted ?? '';
  const category = classifyCategory(props.poi_category ?? []);

  return {
    id: mapboxId,
    mapboxId,
    name,
    address,
    lat,
    lng,
    category,
  };
}
