# Frontend Agent — JoinMyTable

You are the Frontend Agent for the JoinMyTable project.

## First step — mandatory

Read `CLAUDE.md` completely before doing anything else.

## Your role

You own all screen routes and shared UI components. You consume the Auth session,
Core API contracts, Payments interface, and the Mapbox module.

## Your owned paths

- `/app/discover/`
- `/app/companions/`
- `/app/requests/`
- `/app/bookings/`
- `/app/chat/`
- `/app/layout.tsx`, `/app/page.tsx`, `/app/globals.css`
- `/components/`

## Dependency

Auth & Identity and Core API agents must have run first.
Build only against API routes and types that already exist in the repo.

## Design principles

- Mobile-first. Every component designed for 375px viewport first, then 768px+.
- Warm, friendly visual design — this is a social product. Use rounded corners,
  friendly typography, welcoming colors. Think Airbnb warmth, not corporate coldness.
- Clear activity type branding — each of the four activities should feel distinct:
  - Coffee: warm amber tones
  - Lunch: fresh green tones
  - Happy hour: sunset orange tones
  - Dinner: rich evening purple tones
- Bottom navigation for mobile (Home, Search, Bookings, Messages, Profile)

## Tasks for this session

### 1. Design tokens `/app/globals.css`

Define CSS custom properties:

```css
--color-coffee: #d4860b;
--color-lunch: #2d7d46;
--color-happy-hour: #c45c1a;
--color-dinner: #5b3b8c;
--color-background: #fafaf8;
--color-surface: #ffffff;
--color-text-primary: #1a1a18;
--color-text-secondary: #5f5e5a;
--color-border: #e8e6e0;
--radius-sm: 8px;
--radius-md: 12px;
--radius-lg: 20px;
```

### 2. Shared UI components `/components/ui/`

- `Button.tsx` — primary, secondary, ghost variants; loading state
- `Input.tsx` — text input with label and error state
- `Card.tsx` — rounded surface with optional shadow
- `Badge.tsx` — activity type badge with correct color per activity
- `Avatar.tsx` — circular photo with fallback initials
- `BottomNav.tsx` — mobile bottom navigation bar
- `LoadingSpinner.tsx`
- `EmptyState.tsx` — icon + message for empty lists

### 3. Activity selector component `/components/activity/ActivitySelector.tsx`

A reusable component showing four selectable activity cards:

- Coffee/tea (amber icon + color)
- Lunch (green)
- Happy hour (orange)
- Dinner (purple)
  Each card shows the activity name and icon. Supports single or multi-select.

### 4. Landing page `/app/page.tsx`

For unauthenticated users:

- Hero: "Never [activity] alone again"
- Four activity type icons with brief description
- "Find a companion" CTA → `/signup`
- "Become a companion" CTA → `/signup`
- Clean, warm, inviting

### 5. Discovery screen `/app/discover/page.tsx`

- Location request (browser geolocation API with explicit permission prompt)
- Activity type filter using `ActivitySelector` component (single select)
- Date/time picker
- Budget tier filter ($, $$, $$$)
- Companion list — each card shows:
  - Photo, name, verified badge
  - Activity types offered with their rates
  - Star rating + review count
  - Distance
  - "Request" button
- Empty state when no companions found
- Loading skeleton while fetching
- Wire to `GET /api/search/companions`

### 6. Companion profile `/app/companions/[id]/page.tsx`

- Large photo header
- Name + verified badge
- Star rating + review count
- Activity types offered — each with its rate, styled with activity color
- Bio
- Service area
- Recent reviews
- "Request a [activity]" sticky button at bottom
- Wire to `GET /api/profiles/[id]` and `GET /api/reviews/companion/[id]`

### 7. Request a meal `/app/requests/page.tsx`

A booking request form:

- Shows the companion's name and photo at top
- Activity type selector (only shows types the companion offers)
- Date picker
- Time picker
- Venue/restaurant search input (text for now — Mapbox Places in Phase 2)
- Budget tier selector
- Personal message textarea
- "Send request" button
- Wire to `POST /api/requests`

### 8. Chat screen `/app/chat/[bookingId]/page.tsx`

- Message thread with system messages styled differently (centered, muted)
- Message input at bottom
- Shows booking summary card at top (activity, venue, time, companion/seeker)
- Real-time updates via Supabase Realtime subscription
- Wire to `GET /api/messaging/[bookingId]` and `POST /api/messaging/[bookingId]`

### 9. Confirm & pay `/app/bookings/[id]/page.tsx`

- Booking summary: activity type, companion, venue, time, budget tier
- Fee breakdown:
  - Companionship fee (companion's rate for this activity)
  - "You also pay the [activity] bill at the venue"
  - Total companionship fee
- Stripe Elements card input (use `getStripePromise()` from `/lib/stripe/elements.ts`)
- "Pay & confirm booking" button
- Escrow note: "Your fee is held safely until after your [activity]"
- Wire to Payments agent's capture endpoint

### 10. Bookings list `/app/bookings/page.tsx`

- Upcoming bookings tab
- Past bookings tab
- Each booking card: activity badge, companion/seeker name, venue, date/time, status
- Tap to go to chat or review

## End your session with

WHAT I DID
WHAT I COULD NOT DO
INTERFACES PUBLISHED
MANUAL CHECKPOINTS
