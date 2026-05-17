// RLS policy verification.
//
// Owner: QA & Testing agent. Source of truth: the policies declared in
// supabase/migrations/20260515000600_rls.sql. The contract is:
//   - users access only their own row (verified companions visible too)
//   - companion profiles discoverable only when verified_at is set
//   - availability of unverified companions hidden from outsiders
//   - messages, payments, bookings, meal_requests: participants-only
//   - reviews: public-readable, insert gated on completed-booking
//     participation
//
// Approach: spin up two unrelated test users, then prove that user B
// cannot read or modify user A's rows except through the explicit
// allow-listed paths (verified-companion discovery, booking
// counterparties, etc.). The anon client is also used to verify that
// a logged-out caller sees nothing at all.
//
// Skips automatically when TEST_SUPABASE_* env vars are not present.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { noTestSupabaseEnv } from '../_helpers/env';
import { adminClient, anonClient } from '../_helpers/supabase-clients';
import {
  createCompanionProfile,
  createTestUser,
  deleteTestUsers,
  setCompanionVerification,
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
  let companionAProfileId: string;
  const created: TestUser[] = [];

  beforeAll(async () => {
    companionA = await createTestUser({
      isCompanion: true,
      isSeeker: false,
      name: 'Alice',
    });
    seekerB = await createTestUser({
      isCompanion: false,
      isSeeker: true,
      name: 'Bob',
    });
    viewerC = await createTestUser({
      isCompanion: false,
      isSeeker: true,
      name: 'Carol',
    });
    created.push(companionA, seekerB, viewerC);
    // Companion A has a profile + an availability window. Verification
    // is left as unverified so the default visibility tests reflect
    // the most-restrictive (typical) state.
    const profile = await createCompanionProfile(companionA);
    companionAProfileId = (profile as { id: string }).id;
    await adminClient()
      .from('availability')
      .insert({
        companion_profile_id: companionAProfileId,
        day_or_date: 'Mon',
        time_range: '12:00-13:00',
        activity_types: ['lunch'],
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
      expect(data).toBeNull();
    });

    it('anonymous callers cannot read any user row', async () => {
      const anon = anonClient();
      const { data } = await anon.from('users').select('id').limit(1);
      expect(data ?? []).toEqual([]);
    });

    it('users_update_self: a user CANNOT update another user', async () => {
      const { data, error } = await seekerB.client
        .from('users')
        .update({ name: 'Pwned' })
        .eq('id', companionA.id)
        .select('id');
      // RLS produces a no-op (returns no rows), not an error.
      expect(error).toBeNull();
      expect(data ?? []).toEqual([]);

      // Confirm the actual row was untouched.
      const { data: confirmed } = await adminClient()
        .from('users')
        .select('name')
        .eq('id', companionA.id)
        .maybeSingle();
      expect((confirmed as { name: string } | null)?.name).toBe('Alice');
    });

    it('users_select_verified_companion: verified companions become discoverable', async () => {
      const before = await viewerC.client
        .from('users')
        .select('id')
        .eq('id', companionA.id)
        .maybeSingle();
      expect(before.data).toBeNull();

      await setCompanionVerification(companionA.id, true);

      const after = await viewerC.client
        .from('users')
        .select('id, name')
        .eq('id', companionA.id)
        .maybeSingle();
      expect(after.data).toMatchObject({ id: companionA.id });

      // Restore unverified state for downstream tests in this file.
      await setCompanionVerification(companionA.id, false);
    });
  });

  describe('companion_profiles table', () => {
    it('companion_profiles_select_self: owner sees own profile even when unverified', async () => {
      const { data } = await companionA.client
        .from('companion_profiles')
        .select('user_id, verified_at')
        .eq('user_id', companionA.id)
        .maybeSingle();
      expect(data).toMatchObject({ user_id: companionA.id });
      expect((data as { verified_at: string | null }).verified_at).toBeNull();
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
        bio: 'pwn',
        location: SF,
      });
      expect(error).not.toBeNull();
    });

    it("companion_profiles_update_self: a user CANNOT update another user's profile", async () => {
      const { data, error } = await seekerB.client
        .from('companion_profiles')
        .update({ bio: 'pwn' })
        .eq('user_id', companionA.id)
        .select('user_id');
      expect(error).toBeNull();
      expect(data ?? []).toEqual([]);

      const { data: confirmed } = await adminClient()
        .from('companion_profiles')
        .select('bio')
        .eq('user_id', companionA.id)
        .maybeSingle();
      expect((confirmed as { bio: string } | null)?.bio).not.toBe('pwn');
    });

    it('companion_profiles_delete: a non-owner cannot delete', async () => {
      const { data, error } = await seekerB.client
        .from('companion_profiles')
        .delete()
        .eq('user_id', companionA.id)
        .select('user_id');
      expect(error).toBeNull();
      expect(data ?? []).toEqual([]);

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
        .eq('companion_profile_id', companionAProfileId);
      expect((data ?? []).length).toBeGreaterThan(0);
    });

    it('availability_select_public_verified: outsiders DO NOT see windows of an unverified companion', async () => {
      const { data } = await viewerC.client
        .from('availability')
        .select('id')
        .eq('companion_profile_id', companionAProfileId);
      expect(data ?? []).toEqual([]);
    });

    it('availability_insert_self: a user CANNOT add windows to another companion', async () => {
      const { error } = await seekerB.client.from('availability').insert({
        companion_profile_id: companionAProfileId,
        day_or_date: 'Fri',
        time_range: '12:00-13:00',
        activity_types: ['lunch'],
      });
      expect(error).not.toBeNull();
    });

    it("availability_update_self: a user CANNOT update another companion's window", async () => {
      const { data: rows } = await adminClient()
        .from('availability')
        .select('id')
        .eq('companion_profile_id', companionAProfileId)
        .limit(1);
      const id = (rows as { id: string }[] | null)?.[0]?.id;
      expect(id).toBeDefined();
      if (!id) return;

      const { data, error } = await seekerB.client
        .from('availability')
        .update({ time_range: '00:00-01:00' })
        .eq('id', id)
        .select('id');
      expect(error).toBeNull();
      expect(data ?? []).toEqual([]);
    });

    it("availability_delete_self: a user CANNOT delete another companion's window", async () => {
      const { data: rows } = await adminClient()
        .from('availability')
        .select('id')
        .eq('companion_profile_id', companionAProfileId)
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

      const { data: still } = await adminClient()
        .from('availability')
        .select('id')
        .eq('id', id)
        .maybeSingle();
      expect(still).toMatchObject({ id });
    });
  });
});

describe.skipIf(noTestSupabaseEnv())(
  'RLS: meal_requests / bookings / payments / messages / reviews',
  () => {
    // A verified seeker + verified companion pair, plus a third user
    // (stranger) that should never see anything from their booking.
    let seeker: TestUser;
    let companion: TestUser;
    let stranger: TestUser;
    let requestId: string;
    let bookingId: string;
    const created: TestUser[] = [];

    beforeAll(async () => {
      seeker = await createTestUser({ isSeeker: true, name: 'SeekerS' });
      companion = await createTestUser({ isCompanion: true, isSeeker: false, name: 'CompanionC' });
      stranger = await createTestUser({ isSeeker: true, name: 'Stranger' });
      created.push(seeker, companion, stranger);
      await createCompanionProfile(companion, { verified: true });

      // meal_requests insert via seeker JWT — RLS requires
      // seeker_id = auth.uid().
      const reqInsert = await seeker.client
        .from('meal_requests')
        .insert({
          seeker_id: seeker.id,
          companion_id: companion.id,
          activity_type: 'lunch',
          proposed_time: new Date(Date.now() + 86_400_000).toISOString(),
          venue_name: 'Cafe Test',
          venue_location: 'SF',
          budget_tier: '$$',
          message: 'lunch?',
        })
        .select('id')
        .single();
      requestId = (reqInsert.data as { id: string }).id;
      expect(reqInsert.error).toBeNull();

      // bookings insert is service-role-only by RLS (no client policy);
      // we use admin to seed.
      const bookInsert = await adminClient()
        .from('bookings')
        .insert({
          request_id: requestId,
          activity_type: 'lunch',
          venue_name: 'Cafe Test',
          venue_location: 'SF',
          scheduled_time: new Date(Date.now() + 86_400_000).toISOString(),
          budget_tier: '$$',
          companion_fee: 25,
        })
        .select('id')
        .single();
      bookingId = (bookInsert.data as { id: string }).id;
      expect(bookInsert.error).toBeNull();

      // Seed a payment row (also service-role-only).
      await adminClient().from('payments').insert({
        booking_id: bookingId,
        fee_amount: 25,
        platform_cut: 5,
      });
    });

    afterAll(async () => {
      await deleteTestUsers(created);
    });

    describe('meal_requests', () => {
      it('participants (seeker + companion) can read the request', async () => {
        for (const u of [seeker, companion]) {
          const { data } = await u.client
            .from('meal_requests')
            .select('id')
            .eq('id', requestId)
            .maybeSingle();
          expect(data).toMatchObject({ id: requestId });
        }
      });

      it('strangers CANNOT read the request', async () => {
        const { data } = await stranger.client
          .from('meal_requests')
          .select('id')
          .eq('id', requestId)
          .maybeSingle();
        expect(data).toBeNull();
      });

      it('a stranger CANNOT update status', async () => {
        const { data, error } = await stranger.client
          .from('meal_requests')
          .update({ status: 'accepted' })
          .eq('id', requestId)
          .select('id');
        expect(error).toBeNull();
        expect(data ?? []).toEqual([]);
      });

      it('the seeker CANNOT update status (only the companion can)', async () => {
        const { data, error } = await seeker.client
          .from('meal_requests')
          .update({ status: 'accepted' })
          .eq('id', requestId)
          .select('id');
        expect(error).toBeNull();
        expect(data ?? []).toEqual([]);
      });
    });

    describe('bookings', () => {
      it('participants can read the booking', async () => {
        for (const u of [seeker, companion]) {
          const { data } = await u.client
            .from('bookings')
            .select('id')
            .eq('id', bookingId)
            .maybeSingle();
          expect(data).toMatchObject({ id: bookingId });
        }
      });

      it('strangers cannot read the booking', async () => {
        const { data } = await stranger.client
          .from('bookings')
          .select('id')
          .eq('id', bookingId)
          .maybeSingle();
        expect(data).toBeNull();
      });

      it('no client INSERT policy: even a participant cannot create a booking via PostgREST', async () => {
        const { error } = await seeker.client.from('bookings').insert({
          request_id: requestId,
          activity_type: 'dinner',
          venue_name: 'X',
          venue_location: 'Y',
          scheduled_time: new Date().toISOString(),
          budget_tier: '$',
          companion_fee: 10,
        });
        expect(error).not.toBeNull();
      });
    });

    describe('payments', () => {
      it('participants can read their payment record', async () => {
        for (const u of [seeker, companion]) {
          const { data } = await u.client
            .from('payments')
            .select('booking_id, escrow_status')
            .eq('booking_id', bookingId)
            .maybeSingle();
          expect(data).toMatchObject({ booking_id: bookingId, escrow_status: 'held' });
        }
      });

      it('strangers cannot read the payment record', async () => {
        const { data } = await stranger.client
          .from('payments')
          .select('booking_id')
          .eq('booking_id', bookingId)
          .maybeSingle();
        expect(data).toBeNull();
      });
    });

    describe('messages', () => {
      it('a participant can post a message; a stranger cannot', async () => {
        const ok = await seeker.client.from('messages').insert({
          booking_id: bookingId,
          sender_id: seeker.id,
          body: 'see you there!',
        });
        expect(ok.error).toBeNull();

        const blocked = await stranger.client.from('messages').insert({
          booking_id: bookingId,
          sender_id: stranger.id,
          body: 'I am here too',
        });
        expect(blocked.error).not.toBeNull();
      });

      it('a participant cannot impersonate the other side (sender_id must match auth.uid)', async () => {
        const { error } = await seeker.client.from('messages').insert({
          booking_id: bookingId,
          sender_id: companion.id, // impersonation
          body: 'fake',
        });
        expect(error).not.toBeNull();
      });

      it('participants can read messages; strangers cannot', async () => {
        for (const u of [seeker, companion]) {
          const { data } = await u.client.from('messages').select('id').eq('booking_id', bookingId);
          expect((data ?? []).length).toBeGreaterThanOrEqual(1);
        }
        const { data: strData } = await stranger.client
          .from('messages')
          .select('id')
          .eq('booking_id', bookingId);
        expect(strData ?? []).toEqual([]);
      });
    });

    describe('reviews', () => {
      it('reviews cannot be inserted before the booking is completed', async () => {
        const { error } = await seeker.client.from('reviews').insert({
          booking_id: bookingId,
          reviewer_id: seeker.id,
          reviewee_id: companion.id,
          rating: 5,
        });
        expect(error).not.toBeNull();
      });

      it('a participant CAN insert a review once the booking is completed (and a non-participant cannot)', async () => {
        // Mark the booking completed via admin to simulate the
        // server-side completion flow.
        await adminClient().from('bookings').update({ status: 'completed' }).eq('id', bookingId);

        const ok = await seeker.client.from('reviews').insert({
          booking_id: bookingId,
          reviewer_id: seeker.id,
          reviewee_id: companion.id,
          rating: 5,
          comment: 'great lunch',
        });
        expect(ok.error).toBeNull();

        const blocked = await stranger.client.from('reviews').insert({
          booking_id: bookingId,
          reviewer_id: stranger.id,
          reviewee_id: companion.id,
          rating: 1,
        });
        expect(blocked.error).not.toBeNull();
      });

      it('reviews are publicly readable (no signed-in viewer required)', async () => {
        const anon = anonClient();
        const { error } = await anon.from('reviews').select('id').limit(1);
        // Policy permits select; rows visible regardless of data.
        expect(error).toBeNull();
      });
    });
  },
);

describe.skipIf(noTestSupabaseEnv())('RLS: anonymous reads are blocked everywhere relevant', () => {
  it('anon cannot read users, companion_profiles, availability, meal_requests, bookings, payments, messages', async () => {
    const anon = anonClient();
    for (const table of [
      'users',
      'companion_profiles',
      'availability',
      'meal_requests',
      'bookings',
      'payments',
      'messages',
    ] as const) {
      const { data } = await anon.from(table).select('*').limit(1);
      expect(data ?? []).toEqual([]);
    }
  });
});
