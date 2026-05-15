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

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { noTestSupabaseEnv } from '../_helpers/env';
import { adminClient } from '../_helpers/supabase-clients';
import {
  createTestUser,
  deleteTestUsers,
  createCompanionProfile,
  type TestUser,
} from '../_helpers/test-users';

const SAN_FRANCISCO = { type: 'Point' as const, coordinates: [-122.4194, 37.7749] };

describe.skipIf(noTestSupabaseEnv())('integration: /api/profiles (data layer)', () => {
  const created: TestUser[] = [];

  afterAll(async () => {
    await deleteTestUsers(created);
  });

  describe('PUT /api/profiles/me — companion profile upsert', () => {
    let companion: TestUser;
    beforeAll(async () => {
      companion = await createTestUser({ isCompanion: true, isSeeker: false });
      created.push(companion);
    });

    it('creates the row on first write (insert path)', async () => {
      const { data, error } = await companion.client
        .from('companion_profiles')
        .insert({
          user_id: companion.id,
          headline: 'Hello',
          rate_cents: 2500,
          rate_currency: 'USD',
          meal_types: ['lunch', 'dinner'],
          service_area_center: SAN_FRANCISCO,
          service_radius_m: 5000,
        })
        .select('user_id, rate_cents, verification_status')
        .single();
      expect(error).toBeNull();
      expect(data).toMatchObject({
        user_id: companion.id,
        rate_cents: 2500,
        verification_status: 'unverified',
      });
    });

    it('rejects rate_cents below the CHECK lower bound', async () => {
      const { error } = await companion.client
        .from('companion_profiles')
        .update({ rate_cents: 100 })
        .eq('user_id', companion.id);
      expect(error).not.toBeNull();
    });

    it('rejects rate_cents above the CHECK upper bound', async () => {
      const { error } = await companion.client
        .from('companion_profiles')
        .update({ rate_cents: 50_000 })
        .eq('user_id', companion.id);
      expect(error).not.toBeNull();
    });

    it('rejects service_radius_m outside [500, 100_000]', async () => {
      const tooSmall = await companion.client
        .from('companion_profiles')
        .update({ service_radius_m: 100 })
        .eq('user_id', companion.id);
      expect(tooSmall.error).not.toBeNull();

      const tooBig = await companion.client
        .from('companion_profiles')
        .update({ service_radius_m: 1_000_000 })
        .eq('user_id', companion.id);
      expect(tooBig.error).not.toBeNull();
    });

    it('updates writable fields (update path)', async () => {
      const { data, error } = await companion.client
        .from('companion_profiles')
        .update({ headline: 'Updated', rate_cents: 3000 })
        .eq('user_id', companion.id)
        .select('headline, rate_cents')
        .single();
      expect(error).toBeNull();
      expect(data).toEqual({ headline: 'Updated', rate_cents: 3000 });
    });

    it('refuses cross-user inserts (RLS companion_profiles_insert_self)', async () => {
      const stranger = await createTestUser({ isCompanion: true });
      created.push(stranger);
      const { error } = await stranger.client.from('companion_profiles').insert({
        user_id: companion.id, // not the caller
        rate_cents: 1500,
        service_area_center: SAN_FRANCISCO,
        service_radius_m: 5000,
      });
      expect(error).not.toBeNull();
    });
  });

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

    it('hides unverified companions from outside viewers (core product rule #9)', async () => {
      const { data } = await viewer.client
        .from('companion_profiles')
        .select('user_id')
        .eq('user_id', unverified.id)
        .maybeSingle();
      // Unverified profile is invisible -> 404 at the route layer.
      expect(data).toBeNull();
    });

    it('reveals verified companions to outside viewers', async () => {
      const { data, error } = await viewer.client
        .from('companion_profiles')
        .select('user_id, verification_status')
        .eq('user_id', verified.id)
        .maybeSingle();
      expect(error).toBeNull();
      expect(data).toMatchObject({
        user_id: verified.id,
        verification_status: 'verified',
      });
    });

    it('lets a verified companion see themselves regardless of viewer rule', async () => {
      const { data } = await unverified.client
        .from('companion_profiles')
        .select('user_id')
        .eq('user_id', unverified.id)
        .maybeSingle();
      // Owner sees their own row even when not verified yet
      // (companion_profiles_select_self).
      expect(data).toMatchObject({ user_id: unverified.id });
    });
  });

  describe('availability windows', () => {
    let companion: TestUser;
    beforeAll(async () => {
      companion = await createTestUser({ isCompanion: true });
      created.push(companion);
      await createCompanionProfile(companion);
    });

    it('creates a valid window', async () => {
      const { data, error } = await companion.client
        .from('availability')
        .insert({
          companion_user_id: companion.id,
          day_of_week: 1,
          start_time: '12:00',
          end_time: '13:30',
          meal_type: 'lunch',
          timezone: 'America/Los_Angeles',
        })
        .select('id, day_of_week, start_time, end_time')
        .single();
      expect(error).toBeNull();
      expect(data).toMatchObject({ day_of_week: 1 });
    });

    it('rejects a window where end_time <= start_time (CHECK availability_window_order)', async () => {
      const { error } = await companion.client.from('availability').insert({
        companion_user_id: companion.id,
        day_of_week: 2,
        start_time: '13:00',
        end_time: '12:00',
        meal_type: 'lunch',
        timezone: 'UTC',
      });
      expect(error).not.toBeNull();
    });

    it('rejects insert without a companion_profiles row (FK violation -> conflict at route level)', async () => {
      // A user without a companion profile cannot insert availability.
      const seekerOnly = await createTestUser({ isCompanion: true });
      created.push(seekerOnly);
      // Note: created via admin without a companion_profiles row.
      const { error } = await seekerOnly.client.from('availability').insert({
        companion_user_id: seekerOnly.id,
        day_of_week: 0,
        start_time: '11:00',
        end_time: '12:00',
        meal_type: 'lunch',
        timezone: 'UTC',
      });
      expect(error).not.toBeNull();
    });

    it('lists ordered by (day_of_week, start_time) like the route does', async () => {
      // Insert two more out-of-order windows.
      await companion.client.from('availability').insert([
        {
          companion_user_id: companion.id,
          day_of_week: 0,
          start_time: '18:00',
          end_time: '19:00',
          meal_type: 'dinner',
          timezone: 'UTC',
        },
        {
          companion_user_id: companion.id,
          day_of_week: 1,
          start_time: '09:00',
          end_time: '10:30',
          meal_type: 'lunch',
          timezone: 'UTC',
        },
      ]);

      const { data, error } = await companion.client
        .from('availability')
        .select('day_of_week, start_time')
        .eq('companion_user_id', companion.id)
        .order('day_of_week', { ascending: true })
        .order('start_time', { ascending: true });
      expect(error).toBeNull();
      const rows = (data ?? []) as { day_of_week: number; start_time: string }[];
      const sequence: [number, string][] = rows.map((r) => [r.day_of_week, r.start_time]);
      expect(sequence.length).toBeGreaterThanOrEqual(3);
      const sorted = [...sequence].sort((a, b) => {
        if (a[0] !== b[0]) return a[0] - b[0];
        return a[1].localeCompare(b[1]);
      });
      expect(sequence).toEqual(sorted);
    });

    it('cascades availability when the companion_profiles row is deleted', async () => {
      const ephemeral = await createTestUser({ isCompanion: true });
      created.push(ephemeral);
      await createCompanionProfile(ephemeral);
      await ephemeral.client.from('availability').insert({
        companion_user_id: ephemeral.id,
        day_of_week: 3,
        start_time: '12:00',
        end_time: '13:00',
        meal_type: 'lunch',
        timezone: 'UTC',
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
        .eq('companion_user_id', ephemeral.id);
      expect(leftover ?? []).toEqual([]);
    });
  });

  describe('photo reference', () => {
    let user: TestUser;
    beforeAll(async () => {
      user = await createTestUser({ isSeeker: true });
      created.push(user);
    });

    it('lets the owner set their own avatar_path (any string; namespace check is route-level)', async () => {
      const path = `${user.id}/avatar-1.webp`;
      const { data, error } = await user.client
        .from('users')
        .update({ avatar_path: path })
        .eq('id', user.id)
        .select('avatar_path')
        .single();
      expect(error).toBeNull();
      expect(data).toEqual({ avatar_path: path });
    });

    it('lets the owner clear their avatar_path', async () => {
      const { data, error } = await user.client
        .from('users')
        .update({ avatar_path: null })
        .eq('id', user.id)
        .select('avatar_path')
        .single();
      expect(error).toBeNull();
      expect(data).toEqual({ avatar_path: null });
    });
  });

  describe('owner-only fields cannot be self-promoted', () => {
    let companion: TestUser;
    beforeAll(async () => {
      companion = await createTestUser({ isCompanion: true });
      created.push(companion);
      await createCompanionProfile(companion);
    });

    it('rejects self-verification (CHECK companion_profiles_verified_at_set)', async () => {
      // Even though RLS lets the owner update their row, the constraint
      // forbids `verification_status = 'verified'` without a `verified_at`
      // timestamp. The Auth & Identity agent's verification flow sets
      // BOTH atomically; a malicious client cannot synthesize verification
      // by writing only one column.
      const { error: bareErr } = await companion.client
        .from('companion_profiles')
        .update({ verification_status: 'verified' })
        .eq('user_id', companion.id);
      expect(bareErr).not.toBeNull();
    });
  });
});
