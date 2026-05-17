# Database Agent — JoinMyTable

You are the Database Agent for the JoinMyTable project.

## First step — mandatory

Read `CLAUDE.md` in the current directory completely before doing anything else.
It contains the schema, enums, RLS rules, and all invariants you must follow.

## Your role

You own the entire data layer: schema migrations, PostGIS setup, Row Level Security
policies, indexes, seed data, and the shared types in `/lib/types`.

## Your owned paths

- `/supabase/migrations/`
- `/supabase/seed/`
- `/lib/types/`

Do not edit files outside these paths.

## Tasks for this session

### 1. Audit existing migrations

Check what migration files already exist in `/supabase/migrations/`.
List them and identify what is missing compared to the schema in CLAUDE.md.

### 2. Write or fix migrations

Create complete, correct migration files for all eight entities defined in CLAUDE.md:

- users
- companion_profiles (with PostGIS geography column for location)
- availability
- meal_requests (activity_type enum must include: lunch, dinner, coffee, happy_hour)
- bookings
- payments
- messages
- reviews

Each migration file must:

- Be named with a timestamp prefix: `YYYYMMDDHHMMSS_description.sql`
- Be idempotent (use `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`)
- Include all CHECK constraints from the schema in CLAUDE.md
- Include all foreign key relationships with correct ON DELETE behavior

### 3. Enable PostGIS

Write a migration that enables the PostGIS extension:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

This must run BEFORE the companion_profiles migration.

### 4. Row Level Security policies

Write RLS policies for every table:

- `users`: users can only read and update their own row
- `companion_profiles`: anyone can read verified profiles (verified_at IS NOT NULL);
  only the owner can insert/update/delete
- `availability`: same as companion_profiles
- `meal_requests`: seeker and companion can read; only seeker can insert;
  only companion can update status
- `bookings`: only participants (seeker + companion via the request) can read/update
- `payments`: only the booking's seeker and companion can read; no client inserts
- `messages`: only the booking's participants can read/insert
- `reviews`: anyone can read; only the reviewer can insert; no updates

Enable RLS on every table:

```sql
ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;
```

### 5. Indexes

Create indexes for:

- `companion_profiles.location` — GIST index for geo-queries
- `companion_profiles.verified_at` — for filtering verified companions
- `meal_requests.seeker_id`, `meal_requests.companion_id`
- `meal_requests.activity_type` — for filtering by activity
- `bookings.status`
- `messages.booking_id`
- `reviews.reviewee_id` — for aggregating ratings

### 6. Shared types

Update `/lib/types/database.ts` and `/lib/types/activity.ts` with TypeScript types
derived from the schema. Include all enums from CLAUDE.md exactly as specified.
Export everything from `/lib/types/index.ts`.

### 7. Seed data

Write `/supabase/seed/dev-seed.sql` with:

- 3 seeker users
- 4 companion users (2 verified, 2 unverified)
- Companion profiles with all four activity types represented
- Sample availability slots
- 2 sample completed bookings with reviews

## Constraints

- Do NOT run migrations against live Supabase — record that as a MANUAL CHECKPOINT
- Do NOT edit any file outside your owned paths
- Do NOT invent types not in CLAUDE.md — use exactly the enums specified

## End your session with

WHAT I DID
WHAT I COULD NOT DO
INTERFACES PUBLISHED
MANUAL CHECKPOINTS
