// Test-user lifecycle helpers.
//
// Owner: QA & Testing agent.
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
//
// Schema reference (phase 1 v2 — CLAUDE.md "Database schema"):
//   public.users:              id, email, name, is_seeker, is_companion,
//                              verification_status
//   public.companion_profiles: id, user_id, bio, service_area, location,
//                              activities (jsonb), rates (jsonb),
//                              photo_urls (text[]), verified_at
//   public.availability:       id, companion_profile_id, day_or_date,
//                              time_range, activity_types (text[])

import type { ActivityType } from '@/lib/types';
import { readTestSupabaseEnv } from './env';
import { adminClient, anonClient, asUserClient, type AnyClient } from './supabase-clients';

export interface TestUserOptions {
  isSeeker?: boolean;
  isCompanion?: boolean;
  /** Display name written to public.users.name. */
  name?: string;
}

export interface TestUser {
  id: string;
  email: string;
  password: string;
  name: string;
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
  const name = opts.name ?? `Test User ${userCounter}`;

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

  // Insert mirror row via admin so RLS does not fight us during fixture
  // setup; the production sign-up path uses the same admin client.
  const { error: mirrorErr } = await admin.from('users').upsert(
    {
      id: userId,
      email,
      name,
      is_seeker: isSeeker,
      is_companion: isCompanion,
    },
    { onConflict: 'id' },
  );
  if (mirrorErr) {
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    throw new Error(`Could not create users mirror row: ${mirrorErr.message}`);
  }

  // Sign in via the password grant flow — no admin shortcuts — so the
  // resulting access token is exactly what the app would receive.
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
    name,
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
  await Promise.all(users.map((u) => admin.auth.admin.deleteUser(u.id).catch(() => undefined)));
}

// ---------------------------------------------------------------------------
// Companion profile fixture
// ---------------------------------------------------------------------------

export interface CompanionProfileFixtureOptions {
  bio?: string | null;
  service_area?: string | null;
  /** WGS-84 longitude. Default: San Francisco. */
  lng?: number;
  /** WGS-84 latitude. Default: San Francisco. */
  lat?: number;
  /**
   * Activity-keyed booleans. Defaults to lunch+dinner on, the other two
   * off — enough to exercise the per-activity discovery filters.
   */
  activities?: Partial<Record<ActivityType, boolean>>;
  /**
   * Activity-keyed whole-dollar rates. Defaults to typical CLAUDE.md
   * suggested-fee values (lunch 22, dinner 25, coffee 12, happy_hour 20).
   */
  rates?: Partial<Record<ActivityType, number>>;
  photo_urls?: string[];
  /**
   * If true, set verified_at via the admin client. Use sparingly — the
   * default is unverified, matching the real signup -> review flow.
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
    bio: opts.bio ?? 'QA fixture profile',
    service_area: opts.service_area ?? null,
    // PostGIS geography(Point, 4326) round-trips as GeoJSON.
    location: {
      type: 'Point',
      coordinates: [opts.lng ?? -122.4194, opts.lat ?? 37.7749],
    },
    activities: opts.activities ?? {
      lunch: true,
      dinner: true,
      coffee: false,
      happy_hour: false,
    },
    rates: opts.rates ?? {
      lunch: 22,
      dinner: 25,
      coffee: 12,
      happy_hour: 20,
    },
    photo_urls: opts.photo_urls ?? [],
  };
  if (opts.verified) {
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

/**
 * Promote (or demote) an existing companion profile to verified. Used by
 * tests that need to flip visibility mid-run.
 */
export async function setCompanionVerification(userId: string, verified: boolean): Promise<void> {
  const { error } = await ADMIN()
    .from('companion_profiles')
    .update({ verified_at: verified ? new Date().toISOString() : null })
    .eq('user_id', userId);
  if (error) {
    throw new Error(`Could not set verification for ${userId}: ${error.message}`);
  }
}
