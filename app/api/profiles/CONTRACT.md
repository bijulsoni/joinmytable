# Profiles API — frozen contract (phase 1)

Owner: **Core API agent**. Published for: **Frontend agent**.

This is the wire contract for the `profiles` module. Endpoint shapes and
status codes here are frozen; changes go through the Orchestrator. The
TypeScript shapes returned by every endpoint live in
`app/api/profiles/_lib/types.ts` (`OwnCompanionProfileDTO`,
`PublicCompanionProfileDTO`, `AvailabilityDTO`). Import those rather than
redefining them.

## Conventions

- **Authentication.** Every endpoint requires a signed-in user. The auth
  session is read from the Supabase cookie that
  `middleware.ts` keeps fresh. Unauthenticated callers get `401` with
  body `{ error: { code: "unauthenticated", message } }`.
- **Authorization.** Endpoints that mutate companion-owned state
  additionally require `is_companion = true` on the `public.users` row.
  Callers without companion mode get `409` with code
  `companion_mode_required`.
- **Verification gating (core product rule #9).** The `GET /api/profiles/[id]`
  endpoint surfaces a companion only when their
  `companion_profiles.verification_status = 'verified'`. RLS is the
  enforcer; an unverified or missing companion looks like `404`.
- **Error envelope.** All non-2xx responses are
  ```jsonc
  {
    "error": {
      "code": "<ApiErrorCode>",         // see _lib/errors.ts
      "message": "<human-readable>",
      "details": { ... }                  // present on 400 validation errors
    }
  }
  ```
- **Content-Type.** Requests and responses are `application/json` unless
  noted. `DELETE` returns `204 No Content` on success.
- **PostGIS geography.** `service_area_center` is sent and returned as a
  GeoJSON Point: `{ "type": "Point", "coordinates": [lng, lat] }`. WGS-84
  is implied (`SRID 4326`). Longitude first.

## Error codes

| Code                      | HTTP | Meaning                                                                |
| ------------------------- | ---- | ---------------------------------------------------------------------- |
| `unauthenticated`         | 401  | No signed-in user.                                                     |
| `forbidden`               | 403  | Signed in but the action is not allowed (e.g. cross-user avatar path). |
| `not_found`               | 404  | Resource not found / not visible to the caller.                        |
| `invalid_input`           | 400  | Body failed validation. `details` carries `ZodError.flatten()`.        |
| `conflict`                | 409  | Preconditions not met (e.g. availability before profile exists).       |
| `companion_mode_required` | 409  | Caller is not in companion mode.                                       |
| `internal_error`          | 500  | Unexpected failure.                                                    |

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

Create-or-update the signed-in user's companion profile. Whole-resource
write: every field on the request body lands in the row.

- **Auth:** signed in + companion mode.
- **201:** profile created.
- **200:** profile updated.
- **400:** validation failure.
- **409:** caller not in companion mode (`companion_mode_required`).

The API never lets the caller write
`verification_status`, `verified_at`, `stripe_connect_account_id`,
`stripe_payouts_enabled`, `avg_rating`, or `rating_count`. Those are
maintained by other agents.

**Request body**

```jsonc
{
  "headline": "string | null", // 0-120 chars
  "bio_long": "string | null", // 0-4000 chars
  "rate_cents": 12345, // integer, 500-20000 (DB CHECK)
  "rate_currency": "USD", // ISO-4217 uppercase, default "USD"
  "meal_types": ["lunch", "dinner"], // non-empty subset of MEAL_TYPES
  "service_area_center": {
    // GeoJSON Point, WGS-84
    "type": "Point",
    "coordinates": [-122.4194, 37.7749], // [lng, lat]
  },
  "service_radius_m": 5000, // integer, 500-100000
}
```

**Response**

```jsonc
{ "profile": OwnCompanionProfileDTO }
```

### `DELETE /api/profiles/me`

Hard-delete the caller's companion profile. The
`availability.companion_user_id` foreign key has `ON DELETE CASCADE` so
all availability windows are removed with the profile. Bookings are not
affected (they reference `users.id`).

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
availability list (RLS exposes availability only when the linked profile
is verified, mirroring the visibility of the profile itself).

---

## Availability

Recurring weekly windows. The booking flow (Phase 2) will validate that
a chosen meal slot falls inside one of these.

### `GET /api/profiles/me/availability`

List the caller's own availability windows, ordered by
`(day_of_week, start_time)`.

- **Auth:** signed in + companion mode.

**Response (200)**

```jsonc
{ "availability": AvailabilityDTO[] }
```

### `POST /api/profiles/me/availability`

Create a new window.

- **Auth:** signed in + companion mode.
- **201:** created.
- **400:** validation failure (`end_time` must be strictly after
  `start_time`).
- **409:** caller has no companion profile yet (create one first via
  `PUT /api/profiles/me`).

**Request body**

```jsonc
{
  "day_of_week": 1, // 0 = Sun, 6 = Sat
  "start_time": "12:00", // HH:MM or HH:MM:SS
  "end_time": "13:30",
  "meal_type": "lunch", // "lunch" | "dinner"
  "timezone": "America/Los_Angeles", // IANA name
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
- **400:** validation failure (e.g. resulting window has
  `end_time <= start_time`).
- **404:** window not found / not owned by caller.

**Request body** — any non-empty subset of:

```jsonc
{
  "day_of_week": 2,
  "start_time": "18:30",
  "end_time": "20:00",
  "meal_type": "dinner",
  "timezone": "America/Los_Angeles",
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

## Photo reference

The actual upload of avatar bytes is owned by the **Auth & Identity
agent** (`lib/auth/storage.ts#uploadAvatar`). That helper writes the
file to the `avatars` bucket and stamps `users.avatar_path` with the
resulting key. The endpoints below cover the cases where the Frontend
needs to set `users.avatar_path` to an existing key (e.g. user picked a
previously uploaded photo) or clear it without uploading anything new.

### `PUT /api/profiles/me/photo`

Point `users.avatar_path` at an existing storage key. The key must live
under the caller's `<userId>/` prefix (the convention used by the
uploader).

- **Auth:** signed in.
- **200:** updated.
- **400:** validation failure.
- **403:** path is not in the caller's namespace.

**Request body**

```jsonc
{ "avatar_path": "<userId>/avatar-1715000000000.webp" }
```

**Response (200)**

```jsonc
{ "avatar_path": "<userId>/avatar-1715000000000.webp" }
```

### `DELETE /api/profiles/me/photo`

Clear `users.avatar_path`.

- **Auth:** signed in.
- **200:** cleared.

**Response (200)**

```jsonc
{ "avatar_path": null }
```

---

## DTOs (importable from `_lib/types.ts`)

```ts
interface OwnCompanionProfileDTO {
  user_id: string;
  display_name: string; // joined from public.users
  email: string; // joined from public.users
  avatar_path: string | null; // joined from public.users
  headline: string | null;
  bio_long: string | null;
  rate_cents: number;
  rate_currency: string;
  meal_types: MealType[]; // "lunch" | "dinner"
  service_area_center: GeoJSONPoint;
  service_radius_m: number;
  verification_status: VerificationStatus;
  verified_at: string | null; // ISO timestamp
  avg_rating: number | null;
  rating_count: number;
  created_at: string; // ISO timestamp
  updated_at: string; // ISO timestamp
}

interface PublicCompanionProfileDTO {
  user_id: string;
  display_name: string;
  avatar_path: string | null;
  headline: string | null;
  bio_long: string | null;
  rate_cents: number;
  rate_currency: string;
  meal_types: MealType[];
  service_area_center: GeoJSONPoint;
  service_radius_m: number;
  avg_rating: number | null;
  rating_count: number;
  availability: AvailabilityDTO[];
}

interface AvailabilityDTO {
  id: string;
  day_of_week: number; // 0 (Sun) .. 6 (Sat)
  start_time: string; // HH:MM:SS
  end_time: string; // HH:MM:SS
  meal_type: MealType; // "lunch" | "dinner"
  timezone: string; // IANA
}
```

`MealType`, `VerificationStatus`, and `GeoJSONPoint` come from
`@/lib/types`.
