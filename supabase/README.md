# Supabase schema — JoinMyTable

**Owner:** Database agent. Published as the canonical contract for the
Auth & Identity, Core API, and Payments agents at the close of Phase 0.

## Layout

```
supabase/
├── migrations/                          # Ordered SQL, idempotent
│   ├── 20260515000100_init.sql                       # extensions + enums + helpers
│   ├── 20260515000200_users.sql                      # users, companion_profiles, availability
│   ├── 20260515000300_requests_and_bookings.sql      # meal_requests, bookings
│   ├── 20260515000400_payments_messages_reviews.sql  # payments, messages, reviews
│   ├── 20260515000500_indexes.sql                    # geo + lookup indexes
│   ├── 20260515000600_rls.sql                        # Row Level Security (public schema)
│   └── 20260515010000_storage_rls.sql                # Row Level Security (storage.objects)
├── seed/
│   └── seed.sql                         # Dev + staging sample data
└── README.md                            # This file
```

Migrations are intentionally additive and idempotent (`create … if not
exists`, `do $$ … $$` enum guards, `drop policy if exists`) so the same
file applies to all three environments.

## Entities (ERD summary)

```
auth.users ──1:1── public.users ──1:0..1── companion_profiles ──1:N── availability
                       │                          │
                       │                          └── (Stripe Connect account fields)
                       │
                       ├── meal_requests (seeker_user_id, companion_user_id)
                       │           │
                       │           └─ 1:1 ─ bookings ─ 1:1 ─ payments
                       │                       │
                       │                       ├─ 1:N ─ messages
                       │                       └─ 1:N (≤2) ─ reviews
```

- `users` mirrors `auth.users` by id; every other table FKs into
  `public.users`.
- A `meal_request` becomes a `booking` only when accepted; the
  `bookings.request_id` FK is unique.
- `payments` is 1:1 with `bookings`.
- `messages` and `reviews` are scoped by `booking_id`.

## Enums (Postgres → TS)

| Postgres type         | Values                                                                                   | TS export            |
| --------------------- | ---------------------------------------------------------------------------------------- | -------------------- |
| `meal_type`           | `lunch`, `dinner`                                                                        | `MealType`           |
| `verification_status` | `unverified`, `pending`, `verified`, `rejected`                                          | `VerificationStatus` |
| `request_status`      | `requested`, `accepted`, `declined`, `cancelled`, `expired`                              | `RequestStatus`      |
| `booking_status`      | `accepted`, `confirmed`, `completed`, `cancelled`                                        | `BookingStatus`      |
| `budget_tier`         | `low`, `medium`, `high`                                                                  | `BudgetTier`         |
| `payment_status`      | `pending`, `requires_action`, `authorized`, `captured`, `released`, `refunded`, `failed` | `PaymentStatus`      |
| `escrow_status`       | `pending`, `held`, `released`, `refunded`                                                | `EscrowStatus`       |
| `message_type`        | `user`, `system`                                                                         | `MessageType`        |
| `review_subject_type` | `companion`, `seeker`                                                                    | `ReviewSubjectType`  |
| `cancellation_party`  | `seeker`, `companion`, `system`                                                          | `CancellationParty`  |

Allowed lifecycle transitions live in `lib/types/enums.ts`
(`REQUEST_NEXT_STATES`, `BOOKING_NEXT_STATES`) as the canonical machine-
readable table.

## Geography

PostGIS is enabled. We use `geography(Point, 4326)` (WGS84) for:

- `companion_profiles.service_area_center` plus `service_radius_m` — the
  centre and radius of where a companion will meet. Discovery answers
  "verified companions within N km of this point" using `ST_DWithin` on
  the GiST index.
- `meal_requests.proposed_location` — optional seeker hint.
- `bookings.restaurant_location` — finalised meeting point.

GiST indexes are created for all three columns.

## Row Level Security — quick reference

Full policies live in `20260515000600_rls.sql`. Summary:

| Table                | SELECT                                                       | INSERT                                                      | UPDATE            | DELETE            |
| -------------------- | ------------------------------------------------------------ | ----------------------------------------------------------- | ----------------- | ----------------- |
| `users`              | own; verified companions (discovery); booking counterparties | self only                                                   | self only         | service role only |
| `companion_profiles` | own; verified rows publicly                                  | self only                                                   | self only         | —                 |
| `availability`       | own; rows of verified companions publicly                    | self only                                                   | self only         | self only         |
| `meal_requests`      | participants                                                 | seeker (self)                                               | participants      | —                 |
| `bookings`           | participants                                                 | service role only                                           | participants      | —                 |
| `payments`           | booking participants                                         | service role only                                           | service role only | service role only |
| `messages`           | booking participants                                         | participants (`user` type, self); service role for `system` | —                 | —                 |
| `reviews`            | public                                                       | author (self) on completed booking they participated in     | author (self)     | —                 |

Status-transition rules (e.g. only the companion may move a request to
`accepted`, escrow release only on `bookings.status='completed'`) are
enforced in the **Core API** and **Payments** layers, not in RLS. RLS is
the last-line authorization fence; the API is the rules enforcer (per
`CLAUDE.md`).

### Storage (storage.objects)

Two buckets are owned by the Auth & Identity agent and fenced here:

| Bucket         | Public | SELECT     | INSERT / UPDATE / DELETE                    |
| -------------- | ------ | ---------- | ------------------------------------------- |
| `avatars`      | yes    | anyone     | owner only — object key must start `<uid>/` |
| `verification` | no     | owner only | owner only — object key must start `<uid>/` |

Service-role uploads (used by `lib/auth/storage.ts`) bypass RLS by
design; these policies fence direct anon/JWT access so a compromised
bearer token can never escape its prefix or read another user's
identity document. An admin-review SELECT branch on `verification` will
be added once a dedicated admin role exists (Trust & Safety phase).

## Running migrations + seed

`npm run db:migrate` and `npm run db:seed` are wired to
`scripts/db/migrate.sh` and `scripts/db/seed.sh`. Both shell out to
`psql` against `DATABASE_URL`, so the two prerequisites are:

1. **`psql` on PATH.** On macOS: `brew install libpq && brew link --force libpq` (or `brew install postgresql@16`).
2. **`DATABASE_URL` for the target environment.** Supabase gives you this
   from _Project Settings → Database → Connection string_. The pattern is:

   ```
   postgresql://postgres:<DB_PASSWORD>@db.<PROJECT_REF>.supabase.co:5432/postgres
   ```

   Keep these per-environment; never commit them.

### Apply migrations (idempotent)

```bash
# Dev
DATABASE_URL="postgresql://postgres:<dev-password>@db.<dev-ref>.supabase.co:5432/postgres" \
  npm run db:migrate

# Staging
DATABASE_URL="postgresql://postgres:<staging-password>@db.<staging-ref>.supabase.co:5432/postgres" \
  npm run db:migrate
```

The script applies every `supabase/migrations/*.sql` file in
lexicographic (timestamp) order inside its own transaction
(`--single-transaction -v ON_ERROR_STOP=1`). Re-running is a no-op:
every migration is `create … if not exists` / `do $$ … $$` enum-guarded
/ `drop policy if exists`.

### Verify the applied schema

After migrate, run the post-migration verifier — it asserts the
contract-critical structures (extensions, enums, tables, RLS, GiST geo
indexes, helper function, and a spot-check of RLS policy names):

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/db/verify.sql
```

Expected output ends with:

```
NOTICE:  verify: ok - extensions, enums, tables, RLS, GiST indexes, helpers, and policies are all present.
```

Non-zero exit = the migration set diverged from the published contract;
do not consume.

### Seed dev (and staging, if you want fixtures)

```bash
APP_ENV=development \
DATABASE_URL="postgresql://postgres:<dev-password>@db.<dev-ref>.supabase.co:5432/postgres" \
  npm run db:seed
```

`scripts/db/seed.sh` refuses to run when `APP_ENV=production` — seed
data must **never** land in the production database (core product
rules + privacy).

The seed creates four auth users (password `Password123!`):

- `ava.seeker@joinmytable.test` — seeker
- `ben.companion@joinmytable.test` — verified companion
- `cleo.both@joinmytable.test` — verified, dual-mode
- `dan.unverified@joinmytable.test` — pending companion (RLS hides him
  from discovery, as intended)

It also creates one completed booking (seeker Ava ↔ companion Ben) with
its payment, messages, and reviews, plus one pending request.

## Verifying RLS end-to-end

`scripts/db/verify.sql` only checks that the policies _exist_. To verify
they actually fence access, use a Supabase JS client with a logged-in
seed user (anon key + sign-in) and observe:

| Caller                     | Should see                                                                            | Should NOT see                                                           |
| -------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Anonymous (no session)     | Verified companion rows (`companion_profiles`, their `availability`, their `users`)   | Any `meal_requests`, `bookings`, `payments`, `messages`                  |
| Ava (seeker) signed in     | Own `users` row; verified companion rows; her own requests/bookings/messages/payments | Cleo's other bookings; Dan (`pending` companion, unverified)             |
| Ben (companion) signed in  | Own profile + availability; the Ava↔Ben booking + chat + payment; Ava's `users` row   | Cleo's bookings; payment rows for bookings he is not in                  |
| Dan (unverified) signed in | Own `users` and `companion_profiles` rows                                             | His own profile from anyone _else's_ perspective (i.e. not discoverable) |

The Auth & Identity / QA agents will codify these into integration tests
in Phase 2. The seed data is intentionally shaped so each scenario is
reachable with a single signed-in client.

## Frozen contract (Phase 1)

As of the close of Phase 1, the following are **frozen** and consumed
by Auth & Identity, Core API, and Payments:

- Migration set:
  - `supabase/migrations/20260515000100..600_*.sql` — eight tables, ten
    enums, GiST geo indexes on three `geography(Point, 4326)` columns,
    RLS enabled on every public table, and the
    `public.is_booking_participant(uuid)` helper.
  - `supabase/migrations/20260515010000_storage_rls.sql` — `avatars`
    and `verification` bucket creation + the `storage.objects` RLS
    policies described under _Storage_ above.
- Enum values: `lib/types/enums.ts` (string-literal unions + transition maps).
- TypeScript row/insert/update shapes: `lib/types/database.ts`.
- The `Database` generic for `createClient<Database>()` — already
  wired in `lib/supabase/{client,server}.ts`.
- Seed identities: `ava.seeker@`, `ben.companion@`, `cleo.both@`,
  `dan.unverified@` `joinmytable.test`, password `Password123!`.
- Runner contract: `npm run db:migrate` and `npm run db:seed`
  (`scripts/db/{migrate,seed}.sh`) — accept `DATABASE_URL`,
  idempotent, `APP_ENV=production` blocks seed.
- Verifier: `scripts/db/verify.sql` — asserts extensions, enums, tables,
  RLS, GiST geo indexes, the `is_booking_participant` helper, the core
  RLS policies, and (when the `storage` schema is present) the storage
  bucket policies.

Any change after this point goes through the Orchestrator and is
versioned with a **new** migration file — never an edit to a
historical one.
