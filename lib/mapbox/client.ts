// Client-side Mapbox access token.
//
// Exposed to the browser via `NEXT_PUBLIC_*` so the Frontend agent can
// initialise mapbox-gl. Server-side callers should not read this — the
// geocoding helpers in `./geocoding` read the token themselves and will
// degrade gracefully if it is unset.

export const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';

/** True only when the public token is configured. UI can hide map widgets when false. */
export function isMapboxConfigured(): boolean {
  return MAPBOX_TOKEN.length > 0;
}
