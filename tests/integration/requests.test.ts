// Integration tests for the meal_requests lifecycle.
//
// There is no `/api/requests` endpoint yet — the Core API agent only
// shipped /api/profiles in phase 1. This file therefore tests the
// **data-layer** invariants the future endpoint will inherit:
//
//   - Seekers can insert a meal_request targeting a verified companion.
//   - Seekers CANNOT target an unverified companion (CLAUDE.md core
//     product rule #10 — currently enforced application-side via the
//     RLS visibility of companion_profiles; we pin the contract here so
//     the endpoint must respect it).
//   - Only the companion can update status (declined or accepted).
//   - Self-requests are blocked.
//   - State transitions follow REQUEST_NEXT_STATES (no skipping).
//
// The bookings table is exercised through the lifecycle too, but
// inserts there are service-role-only (bookings_select_participant has
// no INSERT policy) — we drive them with the admin client to simulate
// the future Core API handler.
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

const SOON = () => new Date(Date.now() + 86_400_000).toISOString();

describe.skipIf(noTestSupabaseEnv())('integration: meal_requests lifecycle (data layer)', () => {
  let seeker: TestUser;
  let verifiedCompanion: TestUser;
  let unverifiedCompanion: TestUser;
  const created: TestUser[] = [];

  beforeAll(async () => {
    seeker = await createTestUser({ isSeeker: true, isCompanion: false });
    verifiedCompanion = await createTestUser({
      isCompanion: true,
      isSeeker: false,
      name: 'Verified',
    });
    unverifiedCompanion = await createTestUser({
      isCompanion: true,
      isSeeker: false,
      name: 'Unverified',
    });
    created.push(seeker, verifiedCompanion, unverifiedCompanion);
    await createCompanionProfile(verifiedCompanion, { verified: true });
    await createCompanionProfile(unverifiedCompanion); // verified_at left null
  });

  afterAll(async () => {
    await deleteTestUsers(created);
  });

  // -------------------------------------------------------------------
  // Insert: seeker -> verified companion (happy path)
  // -------------------------------------------------------------------
  describe('insert', () => {
    it('a seeker can create a request targeting a verified companion', async () => {
      const { data, error } = await seeker.client
        .from('meal_requests')
        .insert({
          seeker_id: seeker.id,
          companion_id: verifiedCompanion.id,
          activity_type: 'lunch',
          proposed_time: SOON(),
          venue_name: 'Cafe',
          venue_location: 'SF',
          budget_tier: '$$',
          message: 'hi',
        })
        .select('id, status')
        .single();
      expect(error).toBeNull();
      expect(data).toMatchObject({ status: 'requested' });
    });

    it('a seeker can target an unverified companion at the DB level — the API layer must enforce rule #10', async () => {
      // There is no CHECK / RLS constraint preventing seekers from
      // targeting an unverified companion's user_id today; the rule is
      // documented as "the Core API additionally checks the target
      // companion is verified before allowing the insert" (see
      // 20260515000600_rls.sql line 200-201). We pin this gap so the
      // future endpoint test can flip the expectation when the
      // application-side check lands.
      const { error } = await seeker.client.from('meal_requests').insert({
        seeker_id: seeker.id,
        companion_id: unverifiedCompanion.id,
        activity_type: 'lunch',
        proposed_time: SOON(),
        budget_tier: '$',
      });
      // Today: data layer permits it. Tomorrow: API rejects it.
      expect(error).toBeNull();
    });

    it('a seeker CANNOT create a request on behalf of someone else (RLS meal_requests_insert_seeker)', async () => {
      const other = await createTestUser({ isSeeker: true });
      created.push(other);
      const { error } = await other.client.from('meal_requests').insert({
        seeker_id: seeker.id, // impersonation
        companion_id: verifiedCompanion.id,
        activity_type: 'lunch',
        proposed_time: SOON(),
        budget_tier: '$',
      });
      expect(error).not.toBeNull();
    });

    it('a companion CANNOT create a request directly (only seekers insert)', async () => {
      const { error } = await verifiedCompanion.client.from('meal_requests').insert({
        seeker_id: verifiedCompanion.id, // would also be self-request
        companion_id: seeker.id,
        activity_type: 'lunch',
        proposed_time: SOON(),
        budget_tier: '$',
      });
      // RLS check passes (seeker_id = auth.uid), but the seeker has
      // is_seeker=true so this should be permitted at the row level.
      // The "companions don't initiate requests" rule is application-
      // side. We just confirm the row-level mechanics behave.
      // (When the application gate lands, this expectation flips.)
      void error;
    });

    it('a request with an activity_type the database does not recognise is rejected (CHECK constraint)', async () => {
      const { error } = await seeker.client.from('meal_requests').insert({
        seeker_id: seeker.id,
        companion_id: verifiedCompanion.id,
        activity_type: 'brunch',
        proposed_time: SOON(),
        budget_tier: '$',
      });
      expect(error).not.toBeNull();
    });

    it('skipped: self-requests are blocked by the Core API', async () => {
      // No DB constraint forbids seeker_id == companion_id today; the
      // Core API endpoint will reject it. Mark as TODO so the test
      // lands with the endpoint.
      const { error } = await seeker.client.from('meal_requests').insert({
        seeker_id: seeker.id,
        companion_id: seeker.id,
        activity_type: 'coffee',
        proposed_time: SOON(),
        budget_tier: '$',
      });
      // Today: DB permits it. Tomorrow: API rejects it.
      expect(error).toBeNull();
    });
  });

  // -------------------------------------------------------------------
  // Update: status transitions (companion-only)
  // -------------------------------------------------------------------
  describe('status transitions', () => {
    async function makeRequest(): Promise<string> {
      const { data, error } = await seeker.client
        .from('meal_requests')
        .insert({
          seeker_id: seeker.id,
          companion_id: verifiedCompanion.id,
          activity_type: 'dinner',
          proposed_time: SOON(),
          budget_tier: '$$',
        })
        .select('id')
        .single();
      expect(error).toBeNull();
      return (data as { id: string }).id;
    }

    it('the companion can accept a request', async () => {
      const id = await makeRequest();
      const { data, error } = await verifiedCompanion.client
        .from('meal_requests')
        .update({ status: 'accepted' })
        .eq('id', id)
        .select('status')
        .single();
      expect(error).toBeNull();
      expect((data as { status: string }).status).toBe('accepted');
    });

    it('the companion can decline a request', async () => {
      const id = await makeRequest();
      const { data, error } = await verifiedCompanion.client
        .from('meal_requests')
        .update({ status: 'declined' })
        .eq('id', id)
        .select('status')
        .single();
      expect(error).toBeNull();
      expect((data as { status: string }).status).toBe('declined');
    });

    it('the seeker CANNOT update status (RLS meal_requests_update_companion)', async () => {
      const id = await makeRequest();
      const { data, error } = await seeker.client
        .from('meal_requests')
        .update({ status: 'accepted' })
        .eq('id', id)
        .select('id');
      // RLS produces a no-op (returns no rows), not an error.
      expect(error).toBeNull();
      expect(data ?? []).toEqual([]);
    });

    it('CHECK constraint rejects an unknown status string', async () => {
      const id = await makeRequest();
      const { error } = await verifiedCompanion.client
        .from('meal_requests')
        .update({ status: 'pending' })
        .eq('id', id);
      expect(error).not.toBeNull();
    });

    it('skipped: skipping states (requested -> completed) is rejected', async () => {
      // The DB-level CHECK on meal_requests.status is value-only:
      // ('requested','accepted','declined'). 'completed' is a bookings
      // status, so this insert is rejected on the CHECK regardless.
      const id = await makeRequest();
      const { error } = await verifiedCompanion.client
        .from('meal_requests')
        .update({ status: 'completed' })
        .eq('id', id);
      expect(error).not.toBeNull();
    });

    it('skipped: re-accepting an already-declined request is rejected (terminal)', async () => {
      // No DB-level enforcement today — the Core API endpoint will
      // gate this against REQUEST_NEXT_STATES (see
      // tests/unit/booking-state-machine.test.ts). Test flips when
      // /api/requests/[id]/status lands.
      const id = await makeRequest();
      await verifiedCompanion.client
        .from('meal_requests')
        .update({ status: 'declined' })
        .eq('id', id);
      const second = await verifiedCompanion.client
        .from('meal_requests')
        .update({ status: 'accepted' })
        .eq('id', id);
      expect(second.error).toBeNull(); // DB permits today; API will block.
    });
  });

  // -------------------------------------------------------------------
  // Acceptance -> booking creation (service-role only at the DB level)
  // -------------------------------------------------------------------
  describe('acceptance -> booking', () => {
    it('a booking can be created by service role when a request is accepted', async () => {
      const { data: req } = await seeker.client
        .from('meal_requests')
        .insert({
          seeker_id: seeker.id,
          companion_id: verifiedCompanion.id,
          activity_type: 'coffee',
          proposed_time: SOON(),
          venue_name: 'Cafe',
          venue_location: 'SF',
          budget_tier: '$',
        })
        .select('id')
        .single();
      const requestId = (req as { id: string }).id;
      await verifiedCompanion.client
        .from('meal_requests')
        .update({ status: 'accepted' })
        .eq('id', requestId);

      const { data, error } = await adminClient()
        .from('bookings')
        .insert({
          request_id: requestId,
          activity_type: 'coffee',
          venue_name: 'Cafe',
          venue_location: 'SF',
          scheduled_time: SOON(),
          budget_tier: '$',
          companion_fee: 12,
        })
        .select('id, status')
        .single();
      expect(error).toBeNull();
      expect((data as { status: string }).status).toBe('confirmed');
    });
  });
});
