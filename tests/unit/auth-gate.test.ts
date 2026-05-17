// Unit tests for the Core API authorization gate.
//
// `requireAuth`, `requireCompanionMode`, and `requireSeekerMode` are the
// choke point every protected route handler runs through. They resolve a
// session from the Supabase cookie, look up the public.users mirror row,
// and return one of:
//
//   { ok: true,  caller }                                  -> handler proceeds
//   { ok: false, response: 401 unauthenticated }           -> no session
//   { ok: false, response: 403 forbidden }                 -> no mirror row
//   { ok: false, response: 500 internal_error }            -> mirror lookup failed
//   { ok: false, response: 409 companion_mode_required }   -> not in companion mode
//   { ok: false, response: 409 seeker_mode_required }      -> not in seeker mode
//
// We pin every branch with a mocked Supabase client so a regression
// (e.g. forgetting to check is_companion) shows up immediately. Mock
// shared state lives inside `vi.hoisted` so it is initialised before the
// `vi.mock` factory runs (Vitest hoists mocks above all imports).

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
  };
  const client = {
    auth: { getUser: async () => state.authResponse },
    from: (_table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => state.userResponse,
        }),
      }),
    }),
  };
  return { state, client };
});

vi.mock('@/app/api/_lib/supabase', () => ({
  apiServerClient: async () => mocks.client,
}));

// `requireAuth` does not call next/headers itself (the supabase client
// does), but its `'server-only'` marker is aliased to an empty stub in
// vitest.config.ts so the import does not throw.
vi.mock('next/headers', () => ({
  cookies: () => ({ get: () => undefined, set: () => undefined }),
}));

// Import AFTER the mocks are registered.
import { requireAuth, requireCompanionMode, requireSeekerMode } from '@/app/api/_lib/auth-guard';

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
    expect(result.caller.profile.is_companion).toBe(false);
    expect(result.caller.profile.name).toBe('Alice');
  });
});

describe('requireCompanionMode', () => {
  it('rejects a seeker-only caller with 409 companion_mode_required', async () => {
    mocks.state.authResponse = {
      data: { user: { id: ALICE.id, email: ALICE.email } },
      error: null,
    };
    mocks.state.userResponse = { data: { ...ALICE, is_companion: false }, error: null };
    const result = await requireCompanionMode();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(409);
    const body = await result.response.json();
    expect(body.error.code).toBe('companion_mode_required');
  });

  it('admits a caller with is_companion=true', async () => {
    mocks.state.authResponse = {
      data: { user: { id: ALICE.id, email: ALICE.email } },
      error: null,
    };
    mocks.state.userResponse = { data: { ...ALICE, is_companion: true }, error: null };
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
      data: { user: { id: ALICE.id, email: ALICE.email } },
      error: null,
    };
    mocks.state.userResponse = { data: null, error: null };
    const result = await requireCompanionMode();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(403);
  });
});

describe('requireSeekerMode', () => {
  it('rejects a companion-only caller with 409 seeker_mode_required', async () => {
    mocks.state.authResponse = {
      data: { user: { id: ALICE.id, email: ALICE.email } },
      error: null,
    };
    mocks.state.userResponse = {
      data: { ...ALICE, is_seeker: false, is_companion: true },
      error: null,
    };
    const result = await requireSeekerMode();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(409);
    const body = await result.response.json();
    expect(body.error.code).toBe('seeker_mode_required');
  });

  it('admits a caller with is_seeker=true', async () => {
    mocks.state.authResponse = {
      data: { user: { id: ALICE.id, email: ALICE.email } },
      error: null,
    };
    mocks.state.userResponse = { data: ALICE, error: null };
    const result = await requireSeekerMode();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.caller.profile.is_seeker).toBe(true);
  });
});
