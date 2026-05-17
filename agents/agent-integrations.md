# Integrations Agent — JoinMyTable

You are the Integrations Agent for the JoinMyTable project.

## First step — mandatory

Read `CLAUDE.md` completely before doing anything else.

## Your role

You own the Mapbox and Resend integrations as clean shared modules.
Other agents consume your modules — they never call the third-party APIs directly.

## Your owned paths

- `/lib/mapbox/`
- `/lib/email/`

## Tasks for this session

### 1. Mapbox module `/lib/mapbox/`

#### `/lib/mapbox/client.ts`

```typescript
// Client-side Mapbox access token
export const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;
```

#### `/lib/mapbox/geocoding.ts`

Server-side geocoding utilities:

```typescript
// Convert address string to coordinates
export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null>;

// Reverse geocode: coordinates to human-readable address
export async function reverseGeocode(lat: number, lng: number): Promise<string | null>;

// Search for venues/restaurants near a point
export async function searchVenues(
  query: string,
  lat: number,
  lng: number,
  activityType: ActivityType,
): Promise<Venue[]>;
```

Use the Mapbox Geocoding API v6: `https://api.mapbox.com/search/geocode/v6/`
Use the Mapbox Search API for venue search.

#### `/lib/mapbox/types.ts`

```typescript
export interface Venue {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  category: string; // 'cafe' | 'restaurant' | 'bar'
  mapboxId: string;
}

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  name: string;
  rating: number;
  fee: number;
  activityType: ActivityType;
}
```

#### `/lib/mapbox/index.ts`

Clean barrel export of everything above.

### 2. Venue search API endpoint

Create `/app/api/search/venues/route.ts`:

- `GET /api/search/venues?q=query&lat=x&lng=y&activity_type=coffee`
- Uses `searchVenues` from the Mapbox module
- Filters venue categories by activity type:
  - coffee → category: café, coffee shop
  - lunch/dinner → category: restaurant
  - happy_hour → category: bar, restaurant
- Returns array of `Venue` objects

### 3. Email module `/lib/email/`

#### `/lib/email/client.ts`

```typescript
import { Resend } from 'resend';
export const resend = new Resend(process.env.RESEND_API_KEY!);
export const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? 'hello@joinmytable.co';
```

#### `/lib/email/templates/` — one file per template

Each template is a function returning `{ subject: string, html: string, text: string }`.

Templates needed (reference the ActivityType — use the activity name in subject lines):

- `request-received.ts` — companion receives a new request
  - Subject: `New [activity] request from [seeker name]`
- `request-accepted.ts` — seeker's request was accepted
  - Subject: `Your [activity] request was accepted!`
- `request-declined.ts` — seeker's request was declined
  - Subject: `Update on your [activity] request`
- `booking-confirmed.ts` — both parties get this
  - Subject: `Your [activity] is confirmed — [venue] on [date]`
- `meal-reminder.ts` — sent 2 hours before scheduled time
  - Subject: `Reminder: Your [activity] at [venue] is in 2 hours`
- `payment-confirmed.ts` — seeker gets this after payment
  - Subject: `Payment confirmed — your fee is held safely`
- `booking-completed.ts` — after seeker marks complete
  - Subject: `Your [activity] is complete — please leave a review`
- `review-prompt.ts` — 1 hour after completion
  - Subject: `How was your [activity] with [name]?`

All templates must be mobile-friendly HTML emails. Keep them simple and warm.
Include the JoinMyTable name and a relevant CTA button linking to the app.

#### `/lib/email/send.ts`

```typescript
export async function sendEmail(
  to: string,
  template: EmailTemplate,
  data: Record<string, unknown>,
): Promise<{ success: boolean; error?: string }>;
```

Wraps Resend with error handling — never throw; always return a result object.
Log failures but do not let email failures break the main flow.

#### `/lib/email/index.ts`

Barrel export.

### 4. Handle failures gracefully

Both modules must be resilient:

- Mapbox: if geocoding fails, return null (not an error). Log the failure.
- Email: if sending fails, log the error and return `{ success: false }`.
  Never throw — a failed email should never break a booking flow.

### 5. Document the interfaces

Add a comment block at the top of each `index.ts` explaining:

- What the module does
- What env vars it needs
- What it exports and how to call it

## End your session with

WHAT I DID
WHAT I COULD NOT DO
INTERFACES PUBLISHED
MANUAL CHECKPOINTS
