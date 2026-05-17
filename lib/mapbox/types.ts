// Shared types for the Mapbox integration module.
//
// `Venue` is the shape returned by `searchVenues` and by the
// `GET /api/search/venues` endpoint. `MapMarker` is what the Frontend
// renders on the discovery map.

import type { ActivityType } from '@/lib/types';

/** Categorical bucket for a venue. Stays narrow to keep filter logic safe. */
export type VenueCategory = 'cafe' | 'restaurant' | 'bar';

/** A single venue result, suitable for both venue pickers and map pins. */
export interface Venue {
  /** Stable id we can hand to React keys; mirrors `mapboxId` today. */
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  /** 'cafe' | 'restaurant' | 'bar' — used to gate by activity type. */
  category: VenueCategory;
  /** Raw Mapbox feature id; pass back to Mapbox APIs if you need details. */
  mapboxId: string;
}

/** A pin on the discovery map. Same coordinates as a Venue but enriched with marketplace fields. */
export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  name: string;
  rating: number;
  fee: number;
  activityType: ActivityType;
}
