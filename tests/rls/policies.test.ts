// RLS policy verification.
//
// Owner: QA & Testing agent. Source of truth: the policies declared in
// supabase/migrations/20260515000600_rls.sql. The contract is "users
// access only their own data; companion profiles discoverable only when
// verified; messages visible only to booking participants" — these
// tests pin every clause.
//
// Approach: spin up two unrelated test users, then prove that user B
// cannot read or modify user A's rows except through the explicit
// allow-listed paths (verified-companion discovery, booking
// counterparties, etc.). The anon client is also used to verify that
// a logged-out caller sees nothing at all.
//
// The booking-participant policies (messages, payments, cross-user
// review insertion) cover behavior of tables the Core API and Payments
// agents have not yet wired up, so they are flagged below and will be
// fleshed out as those modules land. The current suite covers every
// users / companion_profiles / availability policy.
//
// Skips automatically when TEST_SUPABASE_* env vars are not present.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { noTestSupabaseEnv } from '../_helpers/env';
import { adminClient, anonClient } from '../_helpers/supabase-clients';
import {
  createTestUser,
  deleteTestUsers,
  createCompanionProfile,
  type TestUser,
} from '../_helpers/test-users';

const SF = { type: 'Point' as const, coordinates: [-122.4194, 37.7749] };

describe.skipIf(noTestSupabaseEnv())('RLS: users / companion_profiles / availability', () => {
  // Two unrelated users used across all tables. `companionA` runs in
  // companion mode, `seekerB` in seeker mode. Neither has any booking
  // history, so the only legitimate cross-user visibility comes from
  // the verified-companion discovery rule.
  let companionA: TestUser;
  let seekerB: TestUser;
  // A third user used to exercise verified-companion discovery from a
  // totally unrelated viewer.
  let viewerC: TestUser;
  const created: TestUser[] = [];

  beforeAll(async () => {
    companionA = await createTestUser({ isCompanion: true, isSeeker: false, displayName: 'Alice' });
    seekerB = await createTestUser({ isCompanion: false, isSeeker: true, displayName: 'Bob' });
    viewerC = await createTestUser({ isCompanion: false, isSeeker: true, displayName: 'Carol' });
    created.push(companionA, seekerB, viewerC);
    // Companion A has a profile + an availability window. Verification
    // is left as 'unverified' so the default visibility tests reflect
    // the most-restrictive (typical) state.
    await createCompanionProfile(companionA);
    await adminClient()
      .from('availability')
      .insert({
        companion_user_id: companionA.id,
        day_of_week: 1,
        start_time: '12:00',
        end_time: '13:00',
        meal_type: 'lunch',
        timezone: 'UTC',
      });
  });

  afterAll(async () => {
    await deleteTestUsers(created);
  });

  describe('users table', () => {
    it('users_select_self: a user can read their own row', async () => {
      const { data, error } = await companionA.client
        .from('users')
        .select('id, email')
        .eq('id', companionA.id)
        .maybeSingle();
      expect(error).toBeNull();
      expect(data).toMatchObject({ id: companionA.id });
    });

    it('users_select_self: a user CANNOT read another user via .eq() (when not verified)', async () => {
      const { data } = await seekerB.client
        .from('users')
        .select('id')
        .eq('id', companionA.id)
        .maybeSingle();
      expect(data).toBeNull(); // RLS hides the row from select.
    });

    it('users_select_self: an anonymous caller cannot read any user row', async () => {
      const anon = anonClient();
      const { data } = await anon.from('users').select('id').limit(1);
      expect(data ?? []).toEqual([]);
    });

    it('users_update_self: a user CANNOT update another user', async () => {
      const { data, error } = await seekerB.client
        .from('users')
        .update({ display_name: 'Pwned' })
        .eq('id', companionA.id)
        .select('id');
      // RLS produces a no-op (returns no rows), not an error.
      expect(error).toBeNull();
      expect(data ?? []).toEqual([]);

      // Confirm the actual row was untouched.
      const { data: confirmed } = await adminClient()
        .from('users')
        .select('display_name')
        .eq('id', companionA.id)
        .maybeSingle();
      expect((confirmed as { display_name: string } | null)?.display_name).toBe('Alice');
    });

    it('users_select_verified_companion: verified companions become discoverable', async () => {
      // Hidden while unverified.
      const before = await viewerC.client
        .from('users')
        .select('id')
        .eq('id', companionA.id)
        .maybeSingle();
      expect(before.data).toBeNull();

      // Promote Alice to verified via the admin client (mimics the
      // Auth & Identity verification flow).
      await adminClient()
        .from('companion_profiles')
        .update({
          verification_status: 'verified',
          verified_at: new Date().toISOString(),
        })
        .eq('user_id', companionA.id);

      const after = await viewerC.client
        .from('users')
        .select('id, display_name')
        .eq('id', companionA.id)
        .maybeSingle();
      expect(after.data).toMatchObject({ id: companionA.id });

      // Restore unverified state for downstream tests in this file.
      await adminClient()
        .from('companion_profiles')
        .update({ verification_status: 'unverified', verified_at: null })
        .eq('user_id', companionA.id);
    });
  });

  describe('companion_profiles table', () => {
    it('companion_profiles_select_self: owner sees own profile even when unverified', async () => {
      const { data } = await companionA.client
        .from('companion_profiles')
        .select('user_id, verification_status')
        .eq('user_id', companionA.id)
        .maybeSingle();
      expect(data).toMatchObject({ user_id: companionA.id, verification_status: 'unverified' });
    });

    it('companion_profiles_select_verified: outsiders DO NOT see unverified profiles', async () => {
      const { data } = await viewerC.client
        .from('companion_profiles')
        .select('user_id')
        .eq('user_id', companionA.id)
        .maybeSingle();
      expect(data).toBeNull();
    });

    it('companion_profiles_insert_self: a user CANNOT create a profile for someone else', async () => {
      const { error } = await seekerB.client.from('companion_profiles').insert({
        user_id: companionA.id, // not the caller
        rate_cents: 1500,
        service_area_center: SF,
        service_radius_m: 5000,
      });
      expect(error).not.toBeNull();
    });

    it('companion_profiles_update_self: a user CANNOT update another user\'s profile', async () => {
      const { data, error } = await seekerB.client
        .from('companion_profiles')
        .update({ rate_cents: 999 })
        .eq('user_id', companionA.id)
        .select('user_id');
      expect(error).toBeNull();
      expect(data ?? []).toEqual([]);

      // And the row is unchanged.
      const { data: confirmed } = await adminClient()
        .from('companion_profiles')
        .select('rate_cents')
        .eq('user_id', companionA.id)
        .maybeSingle();
      expect((confirmed as { rate_cents: number } | null)?.rate_cents).not.toBe(999);
    });

    it('there is no DELETE policy for non-owners', async () => {
      const { data, error } = await seekerB.client
        .from('companion_profiles')
        .delete()
        .eq('user_id', companionA.id)
        .select('user_id');
      expect(error).toBeNull();
      expect(data ?? []).toEqual([]);

      // Confirm Alice still has her profile.
      const { data: still } = await adminClient()
        .from('companion_profiles')
        .select('user_id')
        .eq('user_id', companionA.id)
        .maybeSingle();
      expect(still).toMatchObject({ user_id: companionA.id });
    });
  });

  describe('availability table', () => {
    it('availability_select_self: owner sees own windows', async () => {
      const { data } = await companionA.client
        .from('availability')
        .select('id')
        .eq('companion_user_id', companionA.id);
      expect((data ?? []).length).toBeGreaterThan(0);
    });

    it('availability_select_public_verified: outsiders DO NOT see windows of an unverified companion', async () => {
      const { data } = await viewerC.client
        .from('availability')
        .select('id')
        .eq('companion_user_id', companionA.id);
      expect(data ?? []).toEqual([]);
    });

    it('availability_insert_self: a user CANNOT add windows to another companion', async () => {
      const { error } = await seekerB.client.from('availability').insert({
        companion_user_id: companionA.id,
        day_of_week: 5,
        start_time: '12:00',
        end_time: '13:00',
        meal_type: 'lunch',
        timezone: 'UTC',
      });
      expect(error).not.toBeNull();
    });

    it('availability_update_self: a user CANNOT update another companion\'s window', async () => {
      // Find one of Alice's windows via the admin client.
      const { data: rows } = await adminClient()
        .from('availability')
        .select('id')
        .eq('companion_user_id', companionA.id)
        .limit(1);
      const id = (rows as { id: string }[] | null)?.[0]?.id;
      expect(id).toBeDefined();
      if (!id) return;

      const { data, error } = await seekerB.client
        .from('availability')
        .update({ start_time: '00:00', end_time: '01:00' })
        .eq('id', id)
        .select('id');
      expect(error).toBeNull();
      expect(data ?? []).toEqual([]);
    });

    it('availability_delete_self: a user CANNOT delete another companion\'s window', async () => {
      const { data: rows } = await adminClient()
        .from('availability')
        .select('id')
        .eq('companion_user_id', companionA.id)
        .limit(1);
      const id = (rows as { id: string }[] | null)?.[0]?.id;
      expect(id).toBeDefined();
      if (!id) return;

      const { data, error } = await seekerB.client
        .from('availability')
        .delete()
        .eq('id', id)
        .select('id');
      expect(error).toBeNull();
      expect(data ?? []).toEqual([]);

      // Confirm the row is still there.
      const { data: still } = await adminClient()
        .from('availability')
        .select('id')
        .eq('id', id)
        .maybeSingle();
      expect(still).toMatchObject({ id });
    });
  });
});

describe.skipIf(noTestSupabaseEnv())('RLS: messages, payments, bookings, reviews', () => {
  // The Core API and Payments agents have not yet wired up requests,
  // bookings, payments, messages, or reviews. The RLS policies for those
  // tables are written and live in 20260515000600_rls.sql; their tests
  // need data fixtures (a real booking participant pair) that only
  // become possible once the bookings module lands. We assert here only
  // that anonymous reads are blocked on those tables, which IS testable
  // today — full participant-vs-non-participant tests will land alongside
  // the bookings module in a later phase.

  it('anonymous callers cannot read messages, payments, bookings, meal_requests, or reviews-by-id', async () => {
    const anon = anonClient();
    for (const table of ['messages', 'payments', 'bookings', 'meal_requests'] as const) {
      const { data } = await anon.from(table).select('*').limit(1);
      expect(data ?? []).toEqual([]);
    }
    // reviews are publicly selectable by policy (so the discovery page
    // can render ratings); confirm the policy is in fact permissive.
    const reviews = await anon.from('reviews').select('id').limit(1);
    // Empty data because no reviews exist yet, but no error either.
    expect(reviews.error).toBeNull();
  });
});
