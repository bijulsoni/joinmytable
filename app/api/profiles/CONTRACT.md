# Profiles API — frozen contract (phase 1 v2)

Owner: **Core API agent**. Published for: **Frontend agent**.

Wire contract for the `profiles` module. Endpoint shapes and status
codes here are frozen against the phase-1-v2 schema (CLAUDE.md). The
TypeScript shapes returned by every endpoint live in
`app/api/profiles/_lib/types.ts`
(`OwnCompanionProfileDTO`, `PublicCompanionProfileDTO`,
`AvailabilityDTO`). Import those rather than redefining them.

## Conventions

- **Authentication.** Every endpoint requires a signed-in user. The auth
  session is read from the Supabase cookie that `middleware.ts` keeps
  fresh. Unauthenticated callers get `401` with body
  `{ error: { code: "unauthenticated", message } }`.
- **Authorization.** Endpoints that mutate companion-owned state
  additionally require `is_companion = true` on the `public.users` row.
  Callers without companion mode get `409` with code
  `companion_mode_required`.
- **Verification gating (core product rule #10).** `GET /api/profiles/[id]`
  surfaces a companion only when
  `companion_profiles.verified_at IS NOT NULL`. RLS is the enforcer; an
  unverified or unknown id looks like `404` (we do not distinguish).
- **Error envelope.** All non-2xx responses are
  ```jsonc
  {
    "error": {
      "code": "<ApiErrorCode>",          // see app/api/_lib/errors.ts
      "message": "<human-readable>",
      "details": { ... }                  // present on 400 validation errors
    }
  }
  ```
- **Content-Type.** Requests and responses are `application/json` unless
  noted. `DELETE` returns `204 No Content` on success.
- **PostGIS geography.** `location` is sent and returned as a GeoJSON
  Point: `{ "type": "Point", "coordinates": [lng, lat] }`. WGS-84
  (`SRID 4326`). Longitude first.
- **Activity-type vocabulary.** The four MVP types: `lunch`, `dinner`,
  `coffee`, `happy_hour` (core product rule #1). Imports must come from
  `@/lib/types` (`ActivityType`, `ACTIVITY_TYPES`).

## Error codes

| Code                      | HTTP | Meaning                                                         |
| ------------------------- | ---- | --------------------------------------------------------------- |
| `unauthenticated`         | 401  | No signed-in user.                                              |
| `forbidden`               | 403  | Signed in but the action is not allowed.                        |
| `not_found`               | 404  | Resource not found / not visible to the caller.                 |
| `invalid_input`           | 400  | Body failed validation. `details` carries `ZodError.flatten()`. |
| `conflict`                | 409  | Preconditions not met (e.g. add-photo before profile exists).   |
| `companion_mode_required` | 409  | Caller is not in companion mode.                                |
| `internal_error`          | 500  | Unexpected failure.                                             |

---

## Companion profile

### `GET /api/profiles/me`

Read the signed-in user's own companion profile.

- **Auth:** signed in.
- **404:** the user has not created a companion profile yet.

**Response (200)**

```jsonc
{ "profile": OwnCompanionProfileDTO }
```

### `PUT /api/profiles/me`

Create-or-update the signed-in user's companion profile. Every field on
the request body is optional so the Frontend can drip-fill values
during onboarding, but at least one field must be present.

- **Auth:** signed in + companion mode.
- **201:** profile created.
- **200:** profile updated.
- **400:** validation failure.
- **409:** caller not in companion mode (`companion_mode_required`).

The API never lets the caller write
`verified_at`, `rating_avg`, or `photo_urls` here. Verification is
owned by Trust & Safety; photo arrays go through
`/api/profiles/me/photos`; rating roll-ups are computed server-side
when reviews land.

**Request body**

```jsonc
{
  "bio": "string | null", // 0-4000 chars (optional)
  "service_area": "string | null", // 0-200 chars (optional)
  "location": {
    // GeoJSON Point, WGS-84 (optional, nullable)
    "type": "Point",
    "coordinates": [-122.4194, 37.7749], // [lng, lat]
  },
  "activities": {
    // jsonb map keyed by ActivityType (optional)
    "lunch": true,
    "dinner": true,
    "coffee": false,
    "happy_hour": false,
  },
  "rates": {
    // jsonb map keyed by ActivityType (optional)
    "lunch": 22,
    "dinner": 25,
    "coffee": 12,
    "happy_hour": 20,
  },
}
```

Unrecognised keys on `activities` and `rates` are silently dropped so
the four-activity invariant cannot be violated through the API.

**Response**

```jsonc
{ "profile": OwnCompanionProfileDTO }
```

### `DELETE /api/profiles/me`

Hard-delete the caller's companion profile. The
`availability.companion_profile_id` foreign key has `ON DELETE CASCADE`
so all availability windows are removed with the profile. Bookings are
not affected (they reference `users.id` via `meal_requests`).

- **Auth:** signed in + companion mode.
- **204:** deleted.

---

## Public companion view

### `GET /api/profiles/[id]`

Public read of a companion profile by their user id.

- **Auth:** signed in. Anonymous discovery is out of scope for this MVP.
- **404:** unknown id OR companion is not verified (we do not
  distinguish the two — verification is enforced by RLS).

**Response (200)**

```jsonc
{ "profile": PublicCompanionProfileDTO }
```

`PublicCompanionProfileDTO.availability` is the companion's full
availability list (RLS exposes availability only when the linked
profile is verified, mirroring the visibility of the profile itself).

---

## Availability

Free-form day_or_date / time_range windows per CLAUDE.md so callers can
express recurring (`"Mon"`, `"weekdays"`) or one-off (`"2026-06-04"`)
slots without a schema change. The booking flow (Phase 2) will
interpret these strings when matching a chosen meal slot.

### `GET /api/profiles/me/availability`

List the caller's own availability windows, ordered by `day_or_date`.

- **Auth:** signed in + companion mode.

**Response (200)**

```jsonc
{ "availability": AvailabilityDTO[] }
```

Returns `{ "availability": [] }` if no companion profile exists yet
(the Frontend can render the "set up your profile first" state).

### `POST /api/profiles/me/availability`

Create a new window.

- **Auth:** signed in + companion mode.
- **201:** created.
- **400:** validation failure.
- **409:** caller has no companion profile yet (create one first via
  `PUT /api/profiles/me`).

**Request body**

```jsonc
{
  "day_or_date": "Mon", // free-form text, 1-40 chars
  "time_range": "12:00-13:30", // free-form text, 1-40 chars
  "activity_types": ["lunch"], // non-empty subset of ActivityType
}
```

**Response**

```jsonc
{ "availability": AvailabilityDTO }
```

### `PUT /api/profiles/me/availability/[id]`

Patch a window the caller owns. Partial — supply only the fields you
want to change. At least one field is required.

- **Auth:** signed in + companion mode.
- **200:** updated.
- **400:** validation failure.
- **404:** window not found / not owned by caller.

**Request body** — any non-empty subset of:

```jsonc
{
  "day_or_date": "Tue",
  "time_range": "18:30-20:00",
  "activity_types": ["dinner", "happy_hour"],
}
```

**Response**

```jsonc
{ "availability": AvailabilityDTO }
```

### `DELETE /api/profiles/me/availability/[id]`

Remove a window the caller owns.

- **Auth:** signed in + companion mode.
- **204:** deleted.
- **404:** window not found / not owned by caller.

---

## Photos

The new schema stores `photo_urls text[]` on `companion_profiles`.
Uploads (bytes) go through Supabase Storage via the Auth & Identity
uploader — this surface only maintains the URL list. Hard cap of 8
photos per profile.

### `POST /api/profiles/me/photos`

Append a URL to `photo_urls`. Idempotent — re-adding an existing URL is
a no-op.

- **Auth:** signed in + companion mode.
- **201:** added (or already present).
- **400:** validation failure.
- **409:** caller has no companion profile yet, or photo cap reached.

**Request body**

```jsonc
{ "url": "https://.../photo.webp" }
```

**Response**

```jsonc
{ "photo_urls": ["https://.../photo.webp", ...] }
```

### `DELETE /api/profiles/me/photos`

Remove a URL from `photo_urls`. Idempotent — removing a URL that is
not present is a no-op.

- **Auth:** signed in + companion mode.
- **200:** removed (or absent).
- **400:** validation failure.
- **404:** caller has no companion profile.

**Request body**

```jsonc
{ "url": "https://.../photo.webp" }
```

**Response**

```jsonc
{ "photo_urls": ["https://.../other.webp", ...] }
```

---

## DTOs (importable from `app/api/profiles/_lib/types.ts`)

```ts
interface OwnCompanionProfileDTO {
  user_id: string;
  name: string; // joined from public.users.name
  email: string; // joined from public.users.email
  is_seeker: boolean;
  is_companion: boolean;
  account_verification_status: VerificationStatus; // mirrors users.verification_status
  bio: string | null;
  service_area: string | null;
  location: GeoJSONPoint | null;
  activities: Partial<Record<ActivityType, boolean>>;
  rates: Partial<Record<ActivityType, number>>; // whole-dollar amounts
  photo_urls: string[];
  rating_avg: string; // decimal(3,2) serialized as string
  verified_at: string | null; // ISO timestamp; null = unverified
  created_at: string; // ISO timestamp
}

interface PublicCompanionProfileDTO {
  user_id: string;
  name: string;
  bio: string | null;
  service_area: string | null;
  location: GeoJSONPoint | null;
  activities: Partial<Record<ActivityType, boolean>>;
  rates: Partial<Record<ActivityType, number>>;
  photo_urls: string[];
  rating_avg: string;
  availability: AvailabilityDTO[];
}

interface AvailabilityDTO {
  id: string;
  day_or_date: string; // free-form text
  time_range: string; // free-form text
  activity_types: ActivityType[]; // subset of the four MVP types
}
```

`ActivityType`, `VerificationStatus`, and `GeoJSONPoint` come from
`@/lib/types`.

---

## Migration notes from phase 1 v1

The previous draft of this contract used a leaner two-activity schema
(`meal_types`, `rate_cents`, `service_area_center`, `service_radius_m`,
`headline`, `bio_long`, `avatar_path`). The Database agent rewrote the
schema in phase-1-v2 to match CLAUDE.md verbatim (four ActivityTypes,
jsonb maps, free-form availability strings, `photo_urls` array). This
contract reflects the v2 schema. Downstream consumers (Frontend, QA,
Auth) must update their imports accordingly:

- `MealType` / `MEAL_TYPES` → `ActivityType` / `ACTIVITY_TYPES`
- `display_name` / `avatar_path` → `name` (+ `photo_urls` on profile)
- `headline` / `bio_long` → `bio`
- `rate_cents` (+ `rate_currency`) → `rates: { activity: usd }`
- `service_area_center` (+ `service_radius_m`) → `location` (Point) +
  `service_area` (free-form text)
- `availability.day_of_week` + `start_time` + `end_time` + `meal_type` →
  `availability.day_or_date` + `time_range` + `activity_types[]`
- `PUT /api/profiles/me/photo` → `POST/DELETE /api/profiles/me/photos`
