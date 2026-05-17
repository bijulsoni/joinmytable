// RLS / CHECK-constraint tests for the activity_type column.
//
// CLAUDE.md core product rule #1: four activity types only — lunch,
// dinner, coffee, happy_hour. The migrations enforce this with CHECK
// constraints on every table that stores an activity_type:
//
//   meal_requests.activity_type:
//     check (activity_type in ('lunch','dinner','coffee','happy_hour'))
//   bookings.activity_type:
//     check (activity_type in ('lunch','dinner','coffee','happy_hour'))
//
// These tests prove the database itself rejects ad-hoc strings even if a
// future API regression forgot to validate.
//
// Skips automatically when TEST_SUPABASE_* env vars are not present.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { noTestSupabaseEnv } from '../_helpers/env';
import { adminClient } from '../_helpers/supabase-clients';
import {
  createCompanionProfile,
  createTestUser,
  deleteTestUsers,
  type TestUser,
} from '../_helpers/test-users';
import { ACTIVITY_TYPES, type ActivityType } from '@/lib/types';

describe.skipIf(noTestSupabaseEnv())('CHECK constraints: activity_type column', () => {
  let seeker: TestUser;
  let companion: TestUser;
  let requestId: string;
  const created: TestUser[] = [];

  beforeAll(async () => {
    seeker = await createTestUser({ isSeeker: true });
    companion = await createTestUser({ isCompanion: true, isSeeker: false });
    created.push(seeker, companion);
    await createCompanionProfile(companion, { verified: true });

    // Seed a real request so the bookings-CHECK tests have a
    // request_id to FK to.
    const { data, error } = await seeker.client
      .from('meal_requests')
      .insert({
        seeker_id: seeker.id,
        companion_id: companion.id,
        activity_type: 'lunch',
        proposed_time: new Date(Date.now() + 86_400_000).toISOString(),
        budget_tier: '$$',
      })
      .select('id')
      .single();
    expect(error).toBeNull();
    requestId = (data as { id: string }).id;
  });

  afterAll(async () => {
    await deleteTestUsers(created);
  });

  describe('meal_requests.activity_type', () => {
    it.each(ACTIVITY_TYPES)('accepts the canonical type %s', async (activity) => {
      const { error } = await seeker.client.from('meal_requests').insert({
        seeker_id: seeker.id,
        companion_id: companion.id,
        activity_type: activity satisfies ActivityType,
        proposed_time: new Date(Date.now() + 86_400_000).toISOString(),
        budget_tier: '$',
      });
      expect(error).toBeNull();
    });

    it.each(['brunch', 'breakfast', 'happy hour', 'LUNCH', '', 'tea'])(
      'rejects %j (violates CHECK)',
      async (bad) => {
        const { error } = await seeker.client.from('meal_requests').insert({
          seeker_id: seeker.id,
          companion_id: companion.id,
          activity_type: bad,
          proposed_time: new Date(Date.now() + 86_400_000).toISOString(),
          budget_tier: '$',
        });
        expect(error).not.toBeNull();
      },
    );
  });

  describe('bookings.activity_type', () => {
    // bookings INSERT is service-role-only (no client policy). We
    // therefore drive these inserts with the admin client to verify the
    // CHECK constraint fires regardless of RLS.
    //
    // The admin client must be built lazily inside each test — building
    // it at describe-body collection time would call
    // requireTestSupabaseEnv(), which throws when the suite is supposed
    // to self-skip (i.e. when TEST_SUPABASE_* env vars are absent).

    it.each(ACTIVITY_TYPES)('accepts the canonical type %s', async (activity) => {
      const admin = adminClient();
      const { error } = await admin.from('bookings').insert({
        request_id: requestId,
        activity_type: activity satisfies ActivityType,
        venue_name: 'V',
        venue_location: 'L',
        scheduled_time: new Date(Date.now() + 86_400_000).toISOString(),
        budget_tier: '$',
        companion_fee: 10,
      });
      expect(error).toBeNull();
    });

    it.each(['brunch', 'breakfast', 'happy hour', 'LUNCH', ''])(
      'rejects %j (violates CHECK)',
      async (bad) => {
        const admin = adminClient();
        const { error } = await admin.from('bookings').insert({
          request_id: requestId,
          activity_type: bad,
          venue_name: 'V',
          venue_location: 'L',
          scheduled_time: new Date(Date.now() + 86_400_000).toISOString(),
          budget_tier: '$',
          companion_fee: 10,
        });
        expect(error).not.toBeNull();
      },
    );
  });

  describe('budget_tier CHECK (related rule #5)', () => {
    it.each(['$', '$$', '$$$'] as const)('accepts canonical tier %s', async (tier) => {
      const { error } = await seeker.client.from('meal_requests').insert({
        seeker_id: seeker.id,
        companion_id: companion.id,
        activity_type: 'lunch',
        proposed_time: new Date(Date.now() + 86_400_000).toISOString(),
        budget_tier: tier,
      });
      expect(error).toBeNull();
    });

    it.each(['$$$$', 'cheap', '', 'low'])('rejects %j', async (bad) => {
      const { error } = await seeker.client.from('meal_requests').insert({
        seeker_id: seeker.id,
        companion_id: companion.id,
        activity_type: 'lunch',
        proposed_time: new Date(Date.now() + 86_400_000).toISOString(),
        budget_tier: bad,
      });
      expect(error).not.toBeNull();
    });
  });

  describe('skipped: bookings activity_type matches what the companion offers', () => {
    // The QA prompt asks us to verify the booking activity_type matches
    // the companion's `activities` map. There is no DB-level CHECK for
    // this today (the rule is application-side in the booking-creation
    // flow, which has not been wired up yet — see app/api/bookings/),
    // and bookings INSERT is service-role-only. We mark this as a
    // future test so the work isn't forgotten.
    it.skip('TODO: a booking activity_type the companion does not offer is rejected', () => {
      // Implementation deferred until the booking-creation Core API
      // endpoint lands. The CHECK against the companion's `activities`
      // map will likely live in the route handler, with an integration
      // test asserting a 409 conflict response.
    });
  });
});
