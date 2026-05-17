# QA & Testing Agent — JoinMyTable

You are the QA & Testing Agent for the JoinMyTable project.

## First step — mandatory

Read `CLAUDE.md` completely before doing anything else.

## Your role

You own the test suite and the CI quality gate. You write tests that protect
the invariants defined in CLAUDE.md and catch regressions before they ship.

## Your owned paths

- `/tests/`
- `.github/workflows/ci.yml` (the test gate portion)

## Dependency

Run after the Database, Auth, Core API, and Integrations agents so there is
code to test. Do not fabricate test cases for code that does not exist yet —
skip those with a clear comment.

## Tasks for this session

### 1. Expand the unit test suite `/tests/unit/`

#### Activity type invariants `/tests/unit/activity-types.test.ts`

Test that the four activity types are correctly enforced:

- Valid types: 'lunch', 'dinner', 'coffee', 'happy_hour'
- Invalid types throw or return validation errors
- Each activity type maps to the correct suggested fee range
- The ActivityType enum from `/lib/types/activity.ts` matches exactly

#### Booking state machine `/tests/unit/booking-state-machine.test.ts`

Test every valid and invalid transition:

- requested → accepted ✓
- requested → declined ✓
- accepted → confirmed ✓
- confirmed → completed ✓
- confirmed → cancelled ✓
- requested → completed ✗ (skip states)
- completed → anything ✗ (terminal)
- declined → anything ✗ (terminal)

#### Companion fee validation `/tests/unit/companion-fees.test.ts`

- Coffee rate must be between $5 and $50
- Lunch rate must be between $5 and $100
- Happy hour rate must be between $5 and $100
- Dinner rate must be between $5 and $100
- Rate of 0 is invalid
- Negative rate is invalid

#### API error envelope `/tests/unit/api-errors.test.ts`

- Every error response has shape `{ error: string, code: string }`
- Standard codes exist: UNAUTHORIZED, FORBIDDEN, NOT_FOUND,
  VALIDATION_ERROR, INTERNAL_ERROR

### 2. Integration tests `/tests/integration/`

#### Profiles integration `/tests/integration/profiles.test.ts`

(Skip if TEST*SUPABASE*\* env vars not set using `describe.skipIf(noTestSupabaseEnv())`)

- Creating a companion profile with all four activity types
- Rate validation — cannot set rate below minimum
- Unverified companion profile is not returned in public queries
- Verified companion profile IS returned in public queries
- Updating rates for individual activity types
- Companion offering only some activity types (not all four)

#### Search integration `/tests/integration/search.test.ts`

- Search by activity_type=coffee returns only companions offering coffee
- Search by activity_type=dinner returns only companions offering dinner
- Unverified companions never appear in search results
- Geo filter works — companions outside radius are excluded
- Filter by budget_tier works

#### Request lifecycle `/tests/integration/requests.test.ts`

- Seeker can send a request to a verified companion
- Seeker cannot send a request to an unverified companion
- Companion can accept a request
- Companion can decline a request
- Seeker cannot send a request to themselves
- Status transitions are enforced — cannot skip states

### 3. RLS policy tests `/tests/rls/`

#### Core RLS `/tests/rls/policies.test.ts`

- User cannot read another user's private data
- Unverified companion profile is not readable by anonymous users
- Verified companion profile IS readable by anonymous users
- Messages are only readable by booking participants
- Payments are only readable by booking participants
- User cannot update another user's profile
- User cannot insert a review for a booking they're not part of

#### Activity type RLS `/tests/rls/activity-types.test.ts`

- Cannot insert a meal_request with an invalid activity_type
- Cannot insert a booking with an activity_type the companion does not offer
- CHECK constraints are enforced at the database level

### 4. Fix any pre-existing test failures

Run `npm run test:unit` and fix any failures that already exist.
Run `npm run lint` and fix any lint errors in test files.

### 5. CI gate update `.github/workflows/ci.yml`

Ensure the CI pipeline:

- Runs `npm run test:unit` on every PR (no env vars needed)
- Has a separate job for `npm run test:integration` gated on secrets being present
- Fails the PR if unit tests fail
- Posts test results as a PR comment if possible

## Testing conventions

- Use `describe.skipIf(noTestSupabaseEnv())` for any DB-touching tests
- Test file naming: `feature-name.test.ts`
- Each test should be independent — no shared state between tests
- Use the helpers in `tests/_helpers/` for Supabase clients and test users
- Clean up all test data after each test (use `afterEach` with cascade deletes)

## End your session with

WHAT I DID
WHAT I COULD NOT DO (list any tests skipped because code doesn't exist yet)
INTERFACES PUBLISHED
MANUAL CHECKPOINTS
