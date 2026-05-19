// Unit tests for the Core API authorization gates.
//
// `requireAuth` and `requireVerifiedCompanion` are the choke points
// every protected route handler runs through. They resolve a session
// from the Supabase cookie, look up the public.users mirror row, and
// (for `requireVerifiedCompanion`) also check `companion_profiles` for
// a verified row. Returns one of:
//
//   { ok: true,  caller }                                  -> handler proceeds
//   { ok: false, response: 401 unauthenticated }           -> no session
//   { ok: false, response: 403 forbidden }                 -> no mirror row
//   { ok: false, response: 500 internal_error }            -> lookup failed
//   { ok: false, response: 409 companion_mode_required }   -> not a verified companion
//
// The old `requireSeekerMode` / flag-based `requireCompanionMode`
// gates were removed when the seeker/companion split was unified —
// see lib/auth/home-path.ts for the new single-role design.

import { describe, it, expect, vi, beforeEach } from 'vitest';

interface MockUserRow {
  id: string;
  email: string;
  name: string;
  is_seeker: boolean;
  is_companion: boolean;
  verification_status: 'unverified' | 'pending' | 'verified';
  created_at: string;
}

interface MockCompanionProfileRow {
  verified_at: string | null;
}

const mocks = vi.hoisted(() => {
  const state = {
    authResponse: { data: { user: null }, error: null } as {
      data: { user: { id: string; email: string } | null };
      error: { message: string } | null;
    },
    userResponse: { data: null, error: null } as {
      data: MockUserRow | null;
      error: { message: string } | null;
    },
    companionResponse: { data: null, error: null } as {
      data: MockCompanionProfileRow | null;
      error: { message: string } | null;
    },
  };
  const client = {
    auth: { getUser: async () => state.authResponse },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () =>
            table === 'companion_profiles' ? state.companionResponse : state.userResponse,
        }),
      }),
    }),
  };
  return { state, client };
});

vi.mock('@/app/api/_lib/supabase', () => ({
  apiServerClient: async () => mocks.client,
}));

vi.mock('next/headers', () => ({
  cookies: () => ({ get: () => undefined, set: () => undefined }),
}));

import { requireAuth, requireVerifiedCompanion } from '@/app/api/_lib/auth-guard';

const ALICE: MockUserRow = {
  id: 'user-alice',
  email: 'alice@example.test',
  name: 'Alice',
  is_seeker: true,
  is_companion: false,
  verification_status: 'unverified',
  created_at: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  mocks.state.authResponse = { data: { user: null }, error: null };
  mocks.state.userResponse = { data: null, error: null };
  mocks.state.companionResponse = { data: null, error: null };
});

describe('requireAuth', () => {
  it('returns 401 unauthenticated when no session is present', async () => {
    mocks.state.authResponse = { data: { user: null }, error: null };
    const result = await requireAuth();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(401);
    const body = await result.response.json();
    expect(body.error.code).toBe('unauthenticated');
  });

  it('returns 401 when getUser surfaces an error', async () => {
    mocks.state.authResponse = { data: { user: null }, error: { message: 'jwt expired' } };
    const result = await requireAuth();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(401);
  });

  it('returns 500 internal_error when the mirror lookup fails', async () => {
    mocks.state.authResponse = {
      data: { user: { id: ALICE.id, email: ALICE.email } },
      error: null,
    };
    mocks.state.userResponse = { data: null, error: { message: 'pg down' } };
    const result = await requireAuth();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(500);
    const body = await result.response.json();
    expect(body.error.code).toBe('internal_error');
  });

  it('returns 403 forbidden when the auth row exists but the mirror row is missing', async () => {
    mocks.state.authResponse = {
      data: { user: { id: ALICE.id, email: ALICE.email } },
      error: null,
    };
    mocks.state.userResponse = { data: null, error: null };
    const result = await requireAuth();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(403);
    const body = await result.response.json();
    expect(body.error.code).toBe('forbidden');
  });

  it('returns the caller when both the session and mirror row are present', async () => {
    mocks.state.authResponse = {
      data: { user: { id: ALICE.id, email: ALICE.email } },
      error: null,
    };
    mocks.state.userResponse = { data: ALICE, error: null };
    const result = await requireAuth();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.caller.userId).toBe(ALICE.id);
    expect(result.caller.email).toBe(ALICE.email);
    expect(result.caller.profile.name).toBe('Alice');
  });
});

describe('requireVerifiedCompanion', () => {
  beforeEach(() => {
    mocks.state.authResponse = {
      data: { user: { id: ALICE.id, email: ALICE.email } },
      error: null,
    };
    mocks.state.userResponse = { data: ALICE, error: null };
  });

  it('rejects a caller with no companion profile row (409 companion_mode_required)', async () => {
    mocks.state.companionResponse = { data: null, error: null };
    const result = await requireVerifiedCompanion();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(409);
    const body = await result.response.json();
    expect(body.error.code).toBe('companion_mode_required');
  });

  it('rejects an unverified companion profile (409)', async () => {
    mocks.state.companionResponse = { data: { verified_at: null }, error: null };
    const result = await requireVerifiedCompanion();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(409);
  });

  it('admits a verified companion', async () => {
    mocks.state.companionResponse = {
      data: { verified_at: '2026-05-19T00:00:00.000Z' },
      error: null,
    };
    const result = await requireVerifiedCompanion();
    expect(result.ok).toBe(true);
  });

  it('propagates 401 when no session', async () => {
    mocks.state.authResponse = { data: { user: null }, error: null };
    const result = await requireVerifiedCompanion();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(401);
  });
});
