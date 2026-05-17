// Integration tests for the /api/profiles module.
//
// These exercise the same database contract the route handlers in
// app/api/profiles/* rely on: an authenticated PostgREST client, the
// `users` / `companion_profiles` / `availability` tables, the CHECK
// constraints, the cascade rules, and the RLS policies that gate
// verification visibility.
//
// We drive the data layer with the user's JWT (asUserClient) rather
// than booting the Next.js server. This keeps the suite fast and
// portable while still hitting production paths end-to-end.
//
// Skips automatically when TEST_SUPABASE_* env vars are not present.
// See tests/_helpers/env.ts for the contract.
//
// Schema reference (phase 1 v2, see CLAUDE.md):
//   - companion_profiles: bio, service_area, location (Point),
//     activities (jsonb), rates (jsonb), photo_urls (text[]), verified_at
//   - availability: companion_profile_id, day_or_date, time_range,
//     activity_types (text[])

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { noTestSupabaseEnv } from '../_helpers/env';
import { adminClient } from '../_helpers/supabase-clients';
import {
  createCompanionProfile,
  createTestUser,
  deleteTestUsers,
  setCompanionVerification,
  type TestUser,
} from '../_helpers/test-users';

const SF = { type: 'Point' as const, coordinates: [-122.4194, 37.7749] };

describe.skipIf(noTestSupabaseEnv())('integration: /api/profiles (data layer)', () => {
  const created: TestUser[] = [];

  afterAll(async () => {
    await deleteTestUsers(created);
  });

  // -------------------------------------------------------------------
  // PUT /api/profiles/me — companion profile upsert
  // -------------------------------------------------------------------
  describe('PUT /api/profiles/me — companion profile upsert', () => {
    let companion: TestUser;
    beforeAll(async () => {
      companion = await createTestUser({ isCompanion: true, isSeeker: false });
      created.push(companion);
    });

    it('creates the row on first write with all four activity types', async () => {
      const { data, error } = await companion.client
        .from('companion_profiles')
        .insert({
          user_id: companion.id,
          bio: 'Hello',
          service_area: 'SF',
          location: SF,
          activities: { lunch: true, dinner: true, coffee: true, happy_hour: true },
          rates: { lunch: 22, dinner: 25, coffee: 12, happy_hour: 20 },
        })
        .select('user_id, activities, rates, verified_at')
        .single();
      expect(error).toBeNull();
      expect(data).toMatchObject({
        user_id: companion.id,
        activities: { lunch: true, dinner: true, coffee: true, happy_hour: true },
        rates: { lunch: 22, dinner: 25, coffee: 12, happy_hour: 20 },
        verified_at: null, // newly created profiles are unverified
      });
    });

    it('lets the owner update rates for individual activity types', async () => {
      const { data, error } = await companion.client
        .from('companion_profiles')
        .update({ rates: { lunch: 30, dinner: 35, coffee: 15, happy_hour: 25 } })
        .eq('user_id', companion.id)
        .select('rates')
        .single();
      expect(error).toBeNull();
      expect((data as { rates: Record<string, number> }).rates).toEqual({
        lunch: 30,
        dinner: 35,
        coffee: 15,
        happy_hour: 25,
      });
    });

    it('lets a companion offer only some activity types (not all four)', async () => {
      const coffeeOnly = await createTestUser({ isCompanion: true, isSeeker: false });
      created.push(coffeeOnly);
      const { data, error } = await coffeeOnly.client
        .from('companion_profiles')
        .insert({
          user_id: coffeeOnly.id,
          bio: 'Coffee only',
          location: SF,
          activities: { coffee: true, lunch: false, dinner: false, happy_hour: false },
          rates: { coffee: 12 },
        })
        .select('activities, rates')
        .single();
      expect(error).toBeNull();
      expect((data as { activities: Record<string, boolean> }).activities).toMatchObject({
        coffee: true,
      });
      expect((data as { rates: Record<string, number> }).rates).toEqual({ coffee: 12 });
    });

    it('refuses cross-user inserts (RLS companion_profiles_insert_self)', async () => {
      const stranger = await createTestUser({ isCompanion: true });
      created.push(stranger);
      const { error } = await stranger.client.from('companion_profiles').insert({
        user_id: companion.id, // not the caller
        bio: 'pwn',
        location: SF,
      });
      expect(error).not.toBeNull();
    });
  });

  // -------------------------------------------------------------------
  // Discovery / verification gating
  // -------------------------------------------------------------------
  describe('GET /api/profiles/[id] — public companion view', () => {
    let unverified: TestUser;
    let verified: TestUser;
    let viewer: TestUser;

    beforeAll(async () => {
      unverified = await createTestUser({ isCompanion: true });
      verified = await createTestUser({ isCompanion: true });
      viewer = await createTestUser({ isSeeker: true });
      created.push(unverified, verified, viewer);
      await createCompanionProfile(unverified);
      await createCompanionProfile(verified, { verified: true });
    });

    it('hides an unverified companion profile from a public viewer (core product rule #10)', async () => {
      const { data } = await viewer.client
        .from('companion_profiles')
        .select('user_id')
        .eq('user_id', unverified.id)
        .maybeSingle();
      // RLS hides the row -> the route layer turns this into 404.
      expect(data).toBeNull();
    });

    it('reveals a verified companion to a public viewer', async () => {
      const { data, error } = await viewer.client
        .from('companion_profiles')
        .select('user_id, verified_at')
        .eq('user_id', verified.id)
        .maybeSingle();
      expect(error).toBeNull();
      expect(data).toMatchObject({ user_id: verified.id });
      expect((data as { verified_at: string | null }).verified_at).not.toBeNull();
    });

    it('lets a companion see themselves regardless of verification', async () => {
      const { data } = await unverified.client
        .from('companion_profiles')
        .select('user_id, verified_at')
        .eq('user_id', unverified.id)
        .maybeSingle();
      expect(data).toMatchObject({ user_id: unverified.id });
      expect((data as { verified_at: string | null }).verified_at).toBeNull();
    });
  });

  // -------------------------------------------------------------------
  // Rate validation at the data layer (positive whole dollars)
  // -------------------------------------------------------------------
  // Note: the current schema enforces invariants in the API validator
  // (rates must be positive integers $1..$500). The migrations do NOT
  // declare a CHECK constraint on the rates jsonb column itself, so
  // writing rates = { lunch: 0 } via the data layer is accepted by the
  // database — the API blocks it. The integration tests below pin both
  // halves of that story so a future migration that adds a CHECK can
  // tighten this without unsettling the rest of the suite.
  describe('rate behaviour', () => {
    let companion: TestUser;
    beforeAll(async () => {
      companion = await createTestUser({ isCompanion: true, isSeeker: false });
      created.push(companion);
      await createCompanionProfile(companion);
    });

    it('the database currently accepts any jsonb shape (validator is in the API layer)', async () => {
      const { error } = await companion.client
        .from('companion_profiles')
        .update({ rates: { lunch: 0 } })
        .eq('user_id', companion.id);
      // No DB-level CHECK on rates yet. The Core API validator is the
      // enforcer (see tests/unit/companion-fees.test.ts).
      expect(error).toBeNull();
    });
  });

  // -------------------------------------------------------------------
  // Availability — companion-set windows linked to companion_profiles.id
  // -------------------------------------------------------------------
  describe('availability windows', () => {
    let companion: TestUser;
    let profileId: string;

    beforeAll(async () => {
      companion = await createTestUser({ isCompanion: true });
      created.push(companion);
      const profile = await createCompanionProfile(companion);
      profileId = (profile as { id: string }).id;
    });

    it('lets the owner create a valid window', async () => {
      const { data, error } = await companion.client
        .from('availability')
        .insert({
          companion_profile_id: profileId,
          day_or_date: 'Mon',
          time_range: '12:00-13:30',
          activity_types: ['lunch'],
        })
        .select('id, day_or_date, time_range, activity_types')
        .single();
      expect(error).toBeNull();
      expect(data).toMatchObject({
        day_or_date: 'Mon',
        time_range: '12:00-13:30',
        activity_types: ['lunch'],
      });
    });

    it('lets the owner create a one-off date window', async () => {
      const { data, error } = await companion.client
        .from('availability')
        .insert({
          companion_profile_id: profileId,
          day_or_date: '2026-06-04',
          time_range: '18:30-20:00',
          activity_types: ['dinner', 'happy_hour'],
        })
        .select('day_or_date, activity_types')
        .single();
      expect(error).toBeNull();
      expect((data as { activity_types: string[] }).activity_types).toEqual([
        'dinner',
        'happy_hour',
      ]);
    });

    it('cascades availability when the companion_profiles row is deleted', async () => {
      const ephemeral = await createTestUser({ isCompanion: true });
      created.push(ephemeral);
      const profile = await createCompanionProfile(ephemeral);
      const ephemeralProfileId = (profile as { id: string }).id;
      await ephemeral.client.from('availability').insert({
        companion_profile_id: ephemeralProfileId,
        day_or_date: 'Wed',
        time_range: '12:00-13:00',
        activity_types: ['lunch'],
      });

      // Delete the profile via the owner's client.
      const { error: delErr } = await ephemeral.client
        .from('companion_profiles')
        .delete()
        .eq('user_id', ephemeral.id);
      expect(delErr).toBeNull();

      // ON DELETE CASCADE should have removed the availability rows.
      const admin = adminClient();
      const { data: leftover } = await admin
        .from('availability')
        .select('id')
        .eq('companion_profile_id', ephemeralProfileId);
      expect(leftover ?? []).toEqual([]);
    });
  });

  // -------------------------------------------------------------------
  // verified_at is owner-only-readable; only Trust & Safety writes it
  // -------------------------------------------------------------------
  describe('verification gate behaviour', () => {
    let companion: TestUser;
    beforeAll(async () => {
      companion = await createTestUser({ isCompanion: true });
      created.push(companion);
      await createCompanionProfile(companion);
    });

    it('flipping verified_at via admin makes the profile discoverable', async () => {
      const viewer = await createTestUser({ isSeeker: true });
      created.push(viewer);

      const beforeProbe = await viewer.client
        .from('companion_profiles')
        .select('user_id')
        .eq('user_id', companion.id)
        .maybeSingle();
      expect(beforeProbe.data).toBeNull();

      await setCompanionVerification(companion.id, true);

      const afterProbe = await viewer.client
        .from('companion_profiles')
        .select('user_id, verified_at')
        .eq('user_id', companion.id)
        .maybeSingle();
      expect(afterProbe.data).toMatchObject({ user_id: companion.id });
      expect((afterProbe.data as { verified_at: string | null }).verified_at).not.toBeNull();

      // Restore unverified state for downstream tests in this file.
      await setCompanionVerification(companion.id, false);
    });
  });
});
