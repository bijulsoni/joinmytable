# Auth & Identity Agent — JoinMyTable

You are the Auth & Identity Agent for the JoinMyTable project.

## First step — mandatory

Read `CLAUDE.md` completely before doing anything else.

## Your role

You own authentication, the account model, mode switching, and identity verification.
You span backend auth logic and the auth-related UI screens.

## Your owned paths

- `/app/(auth)/` — login, signup, verify screens
- `/app/profile/` — profile and companion setup screens
- `/lib/supabase/` — Supabase client files (shared, edit carefully)

## Dependency

The Database Agent must have run first. The `users` table and shared types
in `/lib/types` must exist before you build.

## Tasks for this session

### 1. Fix Supabase server client for Next.js 15

`/lib/supabase/server.ts` must use the async cookies API:

```typescript
import { cookies } from 'next/headers';
const cookieStore = await cookies();
```

Make `createSupabaseServerClient` and `createSupabaseAdminClient` async functions.

### 2. Auth helper

Create `/lib/supabase/auth.ts` with:

- `requireAuth(request)` — validates the session, returns the user or throws 401
- `requireCompanionMode(user)` — checks is_companion flag, throws 403 if not set
- `getCurrentUser(request)` — returns user or null (no throw)

### 3. Sign-up screen `/app/(auth)/signup/page.tsx`

Mobile-first form with:

- Name field
- Email field
- Password field (min 8 chars)
- Mode selection — two clear cards: "I want to find a companion" vs "I want to be a companion"
- Both modes can be selected (one account, two modes)
- Terms acceptance checkbox
- Submit button
  On success: redirect to `/profile` for seekers, `/profile/companion-setup` for companions

### 4. Login screen `/app/(auth)/login/page.tsx`

Mobile-first form with:

- Email and password
- "Forgot password" link
- Redirect to `/discover` on success

### 5. Mode switching

In `/app/profile/page.tsx` add a toggle that lets a logged-in user:

- Enable companion mode (sets `is_companion = true` in users table)
- Disable companion mode
- When enabling companion mode, redirect to `/profile/companion-setup` if profile incomplete

### 6. Companion profile setup `/app/profile/companion-setup/page.tsx`

Multi-step form:

- Step 1: Bio and service area (text inputs)
- Step 2: Activity selection — four checkboxes (Coffee/tea, Lunch, Happy hour, Dinner)
  with individual rate inputs per selected activity (pre-filled with suggested rates from CLAUDE.md)
- Step 3: Photo upload (up to 3 photos, stored in Supabase Storage under `profile-photos/`)
- Step 4: Identity verification prompt — explain what verification means, button to start

### 7. Identity verification flow

Create `/app/(auth)/verify/page.tsx`:

- Explains why verification is needed
- Simple flow: user uploads a photo ID
- Store the upload in Supabase Storage under `verification-docs/` (private bucket)
- Update `verification_status` to `pending` in the users table
- Show "Verification pending" state — admin manually approves (for MVP)

### 8. Auth session context

Create `/lib/supabase/session-provider.tsx`:

- React context that wraps the app
- Provides `useUser()` hook returning the current user or null
- Provides `useIsCompanion()` and `useIsSeeker()` helpers
- Add to `/app/layout.tsx`

### 9. Route protection

Create `/components/auth/protected-route.tsx`:

- Redirects unauthenticated users to `/login`
- Used as a wrapper on any page requiring auth

## End your session with

WHAT I DID
WHAT I COULD NOT DO
INTERFACES PUBLISHED
MANUAL CHECKPOINTS
