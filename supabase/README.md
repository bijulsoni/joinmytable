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
│   └── 20260515000600_rls.sql                        # Row Level Security
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

| Postgres type | Values | TS export |
|---|---|---|
| `meal_type` | `lunch`, `dinner` | `MealType` |
| `verification_status` | `unverified`, `pending`, `verified`, `rejected` | `VerificationStatus` |
| `request_status` | `requested`, `accepted`, `declined`, `cancelled`, `expired` | `RequestStatus` |
| `booking_status` | `accepted`, `confirmed`, `completed`, `cancelled` | `BookingStatus` |
| `budget_tier` | `low`, `medium`, `high` | `BudgetTier` |
| `payment_status` | `pending`, `requires_action`, `authorized`, `captured`, `released`, `refunded`, `failed` | `PaymentStatus` |
| `escrow_status` | `pending`, `held`, `released`, `refunded` | `EscrowStatus` |
| `message_type` | `user`, `system` | `MessageType` |
| `review_subject_type` | `companion`, `seeker` | `ReviewSubjectType` |
| `cancellation_party` | `seeker`, `companion`, `system` | `CancellationParty` |

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

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `users` | own; verified companions (discovery); booking counterparties | self only | self only | service role only |
| `companion_profiles` | own; verified rows publicly | self only | self only | — |
| `availability` | own; rows of verified companions publicly | self only | self only | self only |
| `meal_requests` | participants | seeker (self) | participants | — |
| `bookings` | participants | service role only | participants | — |
| `payments` | booking participants | service role only | service role only | service role only |
| `messages` | booking participants | participants (`user` type, self); service role for `system` | — | — |
| `reviews` | public | author (self) on completed booking they participated in | author (self) | — |

Status-transition rules (e.g. only the companion may move a request to
`accepted`, escrow release only on `bookings.status='completed'`) are
enforced in the **Core API** and **Payments** layers, not in RLS. RLS is
the last-line authorization fence; the API is the rules enforcer (per
`CLAUDE.md`).

## Running migrations + seed locally

Wiring the Supabase CLI is the **Foundations agent's** Phase 1 task; the
`npm run db:migrate` and `npm run db:seed` scripts currently stub out.
Once `supabase` CLI is configured per environment:

```bash
# Apply migrations
supabase db push                 # against a linked project
# or
supabase db reset                # local: rebuild from migrations + seed

# Seed dev/staging only (NEVER production)
psql "$DATABASE_URL" -f supabase/seed/seed.sql
```

The seed creates four auth users (password `Password123!`):

- `ava.seeker@joinmytable.test` — seeker
- `ben.companion@joinmytable.test` — verified companion
- `cleo.both@joinmytable.test` — verified, dual-mode
- `dan.unverified@joinmytable.test` — pending companion (RLS hides him
  from discovery, as intended)

It also creates one completed booking (seeker Ava ↔ companion Ben) with
its payment, messages, and reviews, plus one pending request.

## Frozen contract

As of Phase 0 close, the following are **frozen** and consumed by Auth &
Identity, Core API, and Payments:

- Table shapes (`supabase/migrations/`).
- Enum values (`lib/types/enums.ts`).
- TypeScript row/insert/update shapes (`lib/types/database.ts`).
- The `Database` generic for `createClient<Database>()`.

Any change after this point goes through the Orchestrator and is
versioned with a new migration.
