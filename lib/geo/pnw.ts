// Pacific Northwest service-area bounds for the controlled beta rollout.
//
// Konnly opens region-by-region so we can balance scalability against
// real demand. Phase 1 is the Seattle metro core: Seattle, Bellevue,
// Kirkland, Redmond, Bothell, Issaquah and the towns between them.
//
// This is a deliberately simple bounding box, not a precise polygon —
// easy to reason about, cheap to evaluate on the client, and good enough
// to keep the beta regional. We can swap it for a polygon (or a set of
// metro boxes) when we expand. Keep this module dependency-free and
// framework-agnostic so BOTH the browser gate and server code can import
// it.
//
// Box: roughly Tacoma-north to Everett-south, Puget Sound east to the
// Cascade foothills.

export interface GeoBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

// Service area opened up from the Seattle–Bellevue pilot to the whole US
// for broader beta feedback. Generous box covering all states incl.
// Alaska + Hawaii (and a bit of North America) — the point is never to
// block a US user. Truly international signups still fall to the waitlist.
export const PNW_BOUNDS: GeoBounds = {
  minLat: 18.0, // ~ south of Hawaii
  maxLat: 72.0, // ~ northern Alaska
  minLng: -170.0, // ~ western Alaska / Hawaii
  maxLng: -66.0, // ~ eastern Maine
};

/** Human-readable name of the open region — used in gate + waitlist copy. */
export const PNW_REGION_LABEL = 'the United States';

/** True when a coordinate falls inside the open beta region. */
export function isInServiceArea(lat: number, lng: number, bounds: GeoBounds = PNW_BOUNDS): boolean {
  return (
    lat >= bounds.minLat && lat <= bounds.maxLat && lng >= bounds.minLng && lng <= bounds.maxLng
  );
}
