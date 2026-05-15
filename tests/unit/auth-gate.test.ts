// Unit tests for the profiles-API authorization gate.
//
// `requireAuth` and `requireCompanionMode` are the choke point every
// /api/profiles handler runs through. They resolve a session from the
// Supabase cookie, look up the public.users mirror row, and return one
// of:
//
//   { ok: true,  caller }                              -> handler proceeds
//   { ok: false, response: 401 unauthenticated }       -> no session
//   { ok: false, response: 403 forbidden }             -> no mirror row
//   { ok: false, response: 500 internal_error }        -> mirror lookup failed
//   { ok: false, response: 409 companion_mode_required } -> caller not in companion mode
//
// We pin every branch with a mocked Supabase client so a regression here
// (e.g. forgetting to check is_companion) shows up immediately. Mock
// shared state lives inside `vi.hoisted` so it is initialised before the
// `vi.mock` factory runs (Vitest hoists mocks above all imports).

import { describe, it, expect, vi, beforeEach } from 'vitest';

interface MockProfileRow {
  id: string;
  email: string;
  display_name: string;
  is_seeker: boolean;
  is_companion: boolean;
}

const mocks = vi.hoisted(() => {
  const state = {
    authResponse: { data: { user: null }, error: null } as {
      data: { user: { id: string; email: string } | null };
      error: { message: string } | null;
    },
    profileResponse: { data: null, error: null } as {
      data: MockProfileRow | null;
      error: { message: string } | null;
    },
  };
  const client = {
    auth: { getUser: async () => state.authResponse },
    from: (_table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => state.profileResponse,
        }),
      }),
    }),
  };
  return { state, client };
});

vi.mock('@/app/api/profiles/_lib/db', () => ({
  profilesServerClient: () => mocks.client,
}));

vi.mock('next/headers', () => ({
  cookies: () => ({ get: () => undefined, set: () => undefined }),
}));

// Import AFTER the mocks are registered.
import { requireAuth, requireCompanionMode } from '@/app/api/profiles/_lib/auth';

const aliceProfile: MockProfileRow = {
  id: 'user-alice',
  email: 'alice@example.test',
  display_name: 'Alice',
  is_seeker: true,
  is_companion: false,
};

beforeEach(() => {
  mocks.state.authResponse = { data: { user: null }, error: null };
  mocks.state.profileResponse = { data: null, error: null };
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
      data: { user: { id: aliceProfile.id, email: aliceProfile.email } },
      error: null,
    };
    mocks.state.profileResponse = { data: null, error: { message: 'pg down' } };
    const result = await requireAuth();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(500);
    const body = await result.response.json();
    expect(body.error.code).toBe('internal_error');
  });

  it('returns 403 forbidden when the auth row exists but the mirror row is missing', async () => {
    mocks.state.authResponse = {
      data: { user: { id: aliceProfile.id, email: aliceProfile.email } },
      error: null,
    };
    mocks.state.profileResponse = { data: null, error: null };
    const result = await requireAuth();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(403);
    const body = await result.response.json();
    expect(body.error.code).toBe('forbidden');
  });

  it('returns the caller when both the session and mirror row are present', async () => {
    mocks.state.authResponse = {
      data: { user: { id: aliceProfile.id, email: aliceProfile.email } },
      error: null,
    };
    mocks.state.profileResponse = { data: aliceProfile, error: null };
    const result = await requireAuth();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.caller.userId).toBe(aliceProfile.id);
    expect(result.caller.email).toBe(aliceProfile.email);
    expect(result.caller.profile.is_companion).toBe(false);
  });
});

describe('requireCompanionMode', () => {
  it('rejects an authenticated seeker-only caller with 409 companion_mode_required', async () => {
    mocks.state.authResponse = {
      data: { user: { id: aliceProfile.id, email: aliceProfile.email } },
      error: null,
    };
    mocks.state.profileResponse = { data: { ...aliceProfile, is_companion: false }, error: null };
    const result = await requireCompanionMode();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(409);
    const body = await result.response.json();
    expect(body.error.code).toBe('companion_mode_required');
  });

  it('admits a caller with is_companion=true', async () => {
    mocks.state.authResponse = {
      data: { user: { id: aliceProfile.id, email: aliceProfile.email } },
      error: null,
    };
    mocks.state.profileResponse = { data: { ...aliceProfile, is_companion: true }, error: null };
    const result = await requireCompanionMode();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.caller.profile.is_companion).toBe(true);
  });

  it('propagates the underlying 401 when there is no session', async () => {
    mocks.state.authResponse = { data: { user: null }, error: null };
    const result = await requireCompanionMode();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(401);
  });

  it('propagates the underlying 403 when the mirror row is missing', async () => {
    mocks.state.authResponse = {
      data: { user: { id: aliceProfile.id, email: aliceProfile.email } },
      error: null,
    };
    mocks.state.profileResponse = { data: null, error: null };
    const result = await requireCompanionMode();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(403);
  });
});
