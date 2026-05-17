// Mapbox integration module — barrel export.
//
// What this module does
//   Wraps the Mapbox Geocoding API v6 with a small, failure-tolerant
//   surface that the rest of JoinMyTable uses for:
//     - turning addresses into coordinates,
//     - turning coordinates back into readable addresses,
//     - searching for public venues (cafés, restaurants, bars) near a
//       point, filtered by activity type (CLAUDE.md core product rule #2).
//
//   Every helper degrades gracefully: on missing token, network failure,
//   non-2xx response, or malformed payload, it logs (via `lib/logger`
//   with `module: 'mapbox/geocoding'`) and returns the empty value
//   (`null` or `[]`) — never throws.
//
// Env vars
//   NEXT_PUBLIC_MAPBOX_TOKEN  Public token. Required for client-side
//                             Mapbox GL usage; also acceptable for
//                             server-side geocoding.
//   MAPBOX_SECRET_TOKEN       (optional) Server-only token, preferred
//                             for server-side geocoding when set.
//
// Exports
//   client.ts     MAPBOX_TOKEN, isMapboxConfigured()
//   geocoding.ts  geocodeAddress(address)
//                 reverseGeocode(lat, lng)
//                 searchVenues(query, lat, lng, activityType)
//   types.ts      Venue, VenueCategory, MapMarker
//
// Typical use (server)
//   import { searchVenues } from '@/lib/mapbox';
//   const venues = await searchVenues('blue bottle', 37.77, -122.42, 'coffee');
//
// Typical use (client)
//   import { MAPBOX_TOKEN, isMapboxConfigured } from '@/lib/mapbox';
//   if (isMapboxConfigured()) mapboxgl.accessToken = MAPBOX_TOKEN;

export { MAPBOX_TOKEN, isMapboxConfigured } from './client';
export { geocodeAddress, reverseGeocode, searchVenues } from './geocoding';
export type { Venue, VenueCategory, MapMarker } from './types';
