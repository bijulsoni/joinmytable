// Test-user lifecycle helpers.
//
// Every integration / RLS suite mints its own users via the service-role
// admin client (so we never need to confirm an email by hand) and tears
// them down in afterAll. The Auth & Identity agent's sign-up flow
// mirrors auth.users -> public.users; we replicate that here so RLS sees
// a fully shaped row.
//
// Every test user gets a unique email so concurrent suites don't
// collide. Cleanup deletes the auth.users row; the public.users row
// cascades via the foreign key (see migration 20260515000200_users.sql).

import { adminClient, asUserClient, anonClient, type AnyClient } from './supabase-clients';
import { readTestSupabaseEnv } from './env';

export interface TestUserOptions {
  isSeeker?: boolean;
  isCompanion?: boolean;
  acceptedGuidelines?: boolean;
  displayName?: string;
}

export interface TestUser {
  id: string;
  email: string;
  password: string;
  accessToken: string;
  /** Authenticated PostgREST client carrying the user's JWT. */
  client: AnyClient;
}

let userCounter = 0;
function uniqueEmail(): string {
  userCounter += 1;
  // ms timestamp + counter + pid keeps suites running in parallel safe.
  return `qa-${Date.now()}-${process.pid}-${userCounter}@joinmytable.test`;
}

const ADMIN = () => adminClient();

/**
 * Create an auth.users row + matching public.users mirror row, then
 * sign in as the user to obtain an access token. Returns everything the
 * caller needs to act as that user (id, email, password, JWT, client).
 */
export async function createTestUser(opts: TestUserOptions = {}): Promise<TestUser> {
  const env = readTestSupabaseEnv();
  if (!env) throw new Error('createTestUser requires TEST_SUPABASE_* env vars.');

  const admin = ADMIN();
  const email = uniqueEmail();
  const password = `Pw-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  const displayName = opts.displayName ?? `Test User ${userCounter}`;

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr || !created.user) {
    throw new Error(`Could not create auth user: ${createErr?.message ?? 'unknown'}`);
  }
  const userId = created.user.id;

  const isSeeker = opts.isSeeker ?? true;
  const isCompanion = opts.isCompanion ?? false;
  const guidelinesAt = opts.acceptedGuidelines === false ? null : new Date().toISOString();

  // Insert mirror row via admin so RLS doesn't fight us during fixture
  // setup; the production sign-up path uses the same admin client.
  const { error: mirrorErr } = await admin.from('users').upsert(
    {
      id: userId,
      email,
      display_name: displayName,
      is_seeker: isSeeker,
      is_companion: isCompanion,
      guidelines_accepted_at: guidelinesAt,
    },
    { onConflict: 'id' },
  );
  if (mirrorErr) {
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    throw new Error(`Could not create users mirror row: ${mirrorErr.message}`);
  }

  // Sign in to get an access token. We use the anon client so we go
  // through the standard password grant flow — no admin shortcuts.
  const session = anonClient();
  const { data: signIn, error: signInErr } = await session.auth.signInWithPassword({
    email,
    password,
  });
  if (signInErr || !signIn.session) {
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    throw new Error(`Could not sign in test user: ${signInErr?.message ?? 'unknown'}`);
  }

  return {
    id: userId,
    email,
    password,
    accessToken: signIn.session.access_token,
    client: asUserClient(signIn.session.access_token),
  };
}

/**
 * Delete a list of auth.users rows. The public.users cascade handles
 * the mirror + dependent companion_profiles / availability rows.
 */
export async function deleteTestUsers(users: TestUser[]): Promise<void> {
  if (users.length === 0) return;
  const admin = ADMIN();
  await Promise.all(
    users.map((u) => admin.auth.admin.deleteUser(u.id).catch(() => undefined)),
  );
}

// ---------------------------------------------------------------------------
// Companion profile fixture
// ---------------------------------------------------------------------------

export interface CompanionProfileFixtureOptions {
  rateCents?: number;
  serviceRadiusM?: number;
  centerLng?: number;
  centerLat?: number;
  /**
   * If true, force verification_status to 'verified' via the admin
   * client. Use sparingly — default is unverified, matching real life.
   */
  verified?: boolean;
}

/**
 * Insert a companion_profiles row for the supplied user. The user must
 * already have `is_companion = true`. Returns the inserted row.
 */
export async function createCompanionProfile(
  user: TestUser,
  opts: CompanionProfileFixtureOptions = {},
): Promise<Record<string, unknown>> {
  const admin = ADMIN();
  const payload: Record<string, unknown> = {
    user_id: user.id,
    headline: 'QA fixture profile',
    bio_long: null,
    rate_cents: opts.rateCents ?? 2500,
    rate_currency: 'USD',
    meal_types: ['lunch', 'dinner'],
    service_area_center: {
      type: 'Point',
      coordinates: [opts.centerLng ?? -122.4194, opts.centerLat ?? 37.7749],
    },
    service_radius_m: opts.serviceRadiusM ?? 5000,
  };
  if (opts.verified) {
    payload.verification_status = 'verified';
    payload.verified_at = new Date().toISOString();
  }
  const { data, error } = await admin
    .from('companion_profiles')
    .insert(payload)
    .select('*')
    .single();
  if (error || !data) {
    throw new Error(`Could not create companion_profiles fixture: ${error?.message}`);
  }
  return data as Record<string, unknown>;
}
