# CLAUDE.md

Operational context for building **Konnly** with a team of specialized agents running
directly via the Claude Code CLI. This file is the authoritative reference while building.
Every agent reads this file first before doing any work.

---

## Project overview

Konnly is a two-sided marketplace for **shared-activity companionship** — lunch,
dinner, coffee/tea, and happy hour. Seekers pay a fixed fee to share an activity with a
companion; companions earn the fee plus the activity (free meal, coffee, or drinks).
The MVP is a **mobile-first responsive website** that expands to a native app later.

---

## Core product rules — INVARIANTS, never violate

Every agent must respect these. If a task seems to require breaking one, stop and
report it rather than proceeding.

1. **Four activity types only for the MVP:** lunch, dinner, coffee/tea, and happy hour.
2. **All activities happen in public venues.** Restaurants, cafés, bars. Never private settings.
3. **The seeker pays for everything** — the companionship fee AND the activity cost.
4. **Companionship fee is fixed per activity type, set by the companion:**
   - Coffee/tea: suggested $10–15
   - Lunch: suggested $20–25
   - Happy hour: suggested $20–25
   - Dinner: suggested $20–25
5. **The seeker sets a budget tier** at booking time to protect against runaway costs.
6. **One account, two modes.** A user can be a seeker, a companion, or both.
7. **Companionship fee held in escrow**, released only after the activity is marked complete.
8. **Chat unlocks only after a request is accepted.**
9. **Reviews only allowed for completed bookings**, and are always two-way.
10. **Unverified companions cannot be discovered or booked.**
11. **Card data never touches our servers.** Stripe Elements only.
12. **In-app messaging only.** No sharing of contact details before booking is confirmed.

---

## Activity types

| Activity   | Duration   | Venue             | Suggested fee |
| ---------- | ---------- | ----------------- | ------------- |
| Coffee/tea | 30–60 min  | Café              | $10–15        |
| Lunch      | 60–90 min  | Restaurant        | $20–25        |
| Happy hour | 60–120 min | Bar or restaurant | $20–25        |
| Dinner     | 90–120 min | Restaurant        | $20–25        |

Companions set individual rates per activity type. They can offer any combination.

---

## Tech stack

| Layer              | Choice                                                   |
| ------------------ | -------------------------------------------------------- |
| Frontend & backend | Next.js 15 (React, TypeScript, App Router) on Vercel     |
| Database           | Supabase — PostgreSQL + PostGIS, Auth, Realtime, Storage |
| Payments           | Stripe Connect                                           |
| Maps               | Mapbox                                                   |
| Email              | Resend                                                   |
| Hosting            | Vercel + Supabase                                        |

---

## Repository structure with ownership

```
/
├── CLAUDE.md
├── README.md
├── package.json
├── next.config.js
├── eslint.config.mjs
│
├── /app
│   ├── layout.tsx, page.tsx, globals.css     [Frontend]
│   ├── /(auth)                               [Auth & Identity]
│   ├── /discover                             [Frontend]
│   ├── /companions/[id]                      [Frontend]
│   ├── /requests                             [Frontend]
│   ├── /bookings                             [Frontend]
│   ├── /chat/[bookingId]                     [Frontend]
│   ├── /profile                              [Frontend / Auth]
│   ├── /safety                               [Trust & Safety]
│   └── /api
│       ├── /profiles                         [Core API]
│       ├── /search                           [Core API]
│       ├── /requests                         [Core API]
│       ├── /bookings                         [Core API]
│       ├── /payments                         [Payments]
│       ├── /messaging                        [Core API]
│       ├── /reviews                          [Core API / Trust & Safety]
│       └── /notifications                    [Core API]
│
├── /components
│   ├── /ui                                   [Frontend]
│   ├── /activity                             [Frontend]
│   ├── /companion                            [Frontend]
│   ├── /booking                              [Frontend]
│   └── /chat                                [Frontend]
│
├── /lib
│   ├── /supabase                             [Foundations]
│   ├── /stripe                               [Payments]
│   ├── /mapbox                               [Integrations]
│   ├── /email                                [Integrations]
│   └── /types                               [Database — do not redefine elsewhere]
│
├── /supabase
│   ├── /migrations                           [Database]
│   └── /seed                                 [Database]
│
└── /tests                                    [QA & Testing]
    ├── /unit
    ├── /integration
    ├── /rls
    └── /_helpers
```

---

## Database schema

### users

```sql
id                  uuid PRIMARY KEY DEFAULT gen_random_uuid()
email               text UNIQUE NOT NULL
name                text NOT NULL
is_seeker           boolean DEFAULT true
is_companion        boolean DEFAULT false
verification_status text DEFAULT 'unverified'
  CHECK (verification_status IN ('unverified','pending','verified'))
created_at          timestamptz DEFAULT now()
```

### companion_profiles

```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
user_id         uuid REFERENCES users(id) ON DELETE CASCADE
bio             text
service_area    text
location        geography(Point, 4326)
activities      jsonb  -- { "lunch":true, "dinner":true, "coffee":true, "happy_hour":false }
rates           jsonb  -- { "lunch":22, "dinner":25, "coffee":12, "happy_hour":20 }
photo_urls      text[]
rating_avg      decimal(3,2) DEFAULT 0
verified_at     timestamptz
created_at      timestamptz DEFAULT now()
```

### availability

```sql
id                    uuid PRIMARY KEY DEFAULT gen_random_uuid()
companion_profile_id  uuid REFERENCES companion_profiles(id) ON DELETE CASCADE
day_or_date           text NOT NULL
time_range            text NOT NULL
activity_types        text[]
```

### meal_requests

```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
seeker_id       uuid REFERENCES users(id)
companion_id    uuid REFERENCES users(id)
activity_type   text NOT NULL
  CHECK (activity_type IN ('lunch','dinner','coffee','happy_hour'))
proposed_time   timestamptz NOT NULL
venue_name      text
venue_location  text
budget_tier     text CHECK (budget_tier IN ('$','$$','$$$'))
message         text
status          text DEFAULT 'requested'
  CHECK (status IN ('requested','accepted','declined'))
created_at      timestamptz DEFAULT now()
```

### bookings

```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
request_id      uuid REFERENCES meal_requests(id)
activity_type   text NOT NULL
venue_name      text NOT NULL
venue_location  text NOT NULL
scheduled_time  timestamptz NOT NULL
budget_tier     text NOT NULL
companion_fee   decimal(10,2) NOT NULL
status          text DEFAULT 'confirmed'
  CHECK (status IN ('confirmed','completed','cancelled'))
created_at      timestamptz DEFAULT now()
```

### payments

```sql
id                        uuid PRIMARY KEY DEFAULT gen_random_uuid()
booking_id                uuid REFERENCES bookings(id)
fee_amount                decimal(10,2) NOT NULL
platform_cut              decimal(10,2) NOT NULL
escrow_status             text DEFAULT 'held'
  CHECK (escrow_status IN ('held','released','refunded'))
stripe_payment_intent_id  text
stripe_transfer_id        text
created_at                timestamptz DEFAULT now()
```

### messages

```sql
id                uuid PRIMARY KEY DEFAULT gen_random_uuid()
booking_id        uuid REFERENCES bookings(id)
sender_id         uuid REFERENCES users(id)
body              text NOT NULL
is_system_message boolean DEFAULT false
sent_at           timestamptz DEFAULT now()
```

### reviews

```sql
id           uuid PRIMARY KEY DEFAULT gen_random_uuid()
booking_id   uuid REFERENCES bookings(id)
reviewer_id  uuid REFERENCES users(id)
reviewee_id  uuid REFERENCES users(id)
rating       int CHECK (rating BETWEEN 1 AND 5)
comment      text
created_at   timestamptz DEFAULT now()
```

---

## Status enums — use exactly these strings

```typescript
type ActivityType = 'lunch' | 'dinner' | 'coffee' | 'happy_hour';
type RequestStatus = 'requested' | 'accepted' | 'declined';
type BookingStatus = 'confirmed' | 'completed' | 'cancelled';
type EscrowStatus = 'held' | 'released' | 'refunded';
type VerificationStatus = 'unverified' | 'pending' | 'verified';
type BudgetTier = '$' | '$$' | '$$$';
```

---

## Booking state machine

```
REQUESTED → ACCEPTED → CONFIRMED → COMPLETED (escrow releases, reviews unlock)
          ↘ DECLINED   ↘ CANCELLED (escrow refunds)
```

---

## Development conventions

- TypeScript everywhere. No plain JavaScript.
- Mobile-first. Phone viewport first, then desktop.
- Server-side authority. Authenticate + authorize every API route. Validate all inputs.
- Shared types from `/lib/types` only. Never redefine entity types locally.
- Activity type is always a typed enum, never a raw string outside `/lib/types`.
- Every API route returns `{ error: string, code: string }` on failure.
- Use `logger.child({ module: 'name' })` from `@/lib/logger`.
- Secrets via env vars only. `NEXT_PUBLIC_*` for client-visible keys only.

---

## npm scripts

```bash
npm run dev             # local dev server
npm run build           # production build
npm run lint            # ESLint
npm run type-check      # TypeScript
npm run test            # unit tests (CI gate)
npm run test:unit       # unit only
npm run test:integration # needs TEST_SUPABASE_* env vars
npm run test:rls        # RLS policy tests
npm run test:all        # everything
npm run db:migrate      # apply migrations
npm run db:seed         # load seed data
```

---

## Multi-agent session model

Eight agents run in parallel terminal sessions. Each session is a separate
`claude --dangerously-skip-permissions` invocation fed its own prompt file.

| Session | Agent           | Prompt file                    |
| ------- | --------------- | ------------------------------ |
| A       | Database        | `agents/agent-database.md`     |
| B       | Auth & Identity | `agents/agent-auth.md`         |
| C       | Core API        | `agents/agent-core-api.md`     |
| D       | Payments        | `agents/agent-payments.md`     |
| E       | Frontend        | `agents/agent-frontend.md`     |
| F       | Integrations    | `agents/agent-integrations.md` |
| G       | QA & Testing    | `agents/agent-qa.md`           |
| H       | Trust & Safety  | `agents/agent-trust.md`        |

Run dependent agents only after their dependencies finish.
See `agents/RUNBOOK.md` for the exact sequence and dependency rules.

---

## Open decisions — escalate to founder before Phase 4

- Platform fee % (what cut does Konnly take?)
- Cancellation policy (how late? any penalty?)
- Escrow release trigger (both tap done? time-based?)
- Companion verification method (ID upload? video selfie?)
