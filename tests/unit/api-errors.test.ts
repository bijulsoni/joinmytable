// Unit tests for the Core API error envelope.
//
// Every JoinMyTable API route returns either a 2xx success body or this
// envelope. The Frontend switches on `error.code`; the human-readable
// `message` is rendered to the user; `details` carries
// `ZodError.flatten()` for validation failures. The status-code mapping
// is part of the frozen contract (app/api/profiles/CONTRACT.md) — any
// change here is a breaking change for the Frontend.

import { describe, it, expect } from 'vitest';
import { apiError, type ApiErrorBody, type ApiErrorCode } from '@/app/api/_lib/errors';

async function bodyOf(response: Response): Promise<ApiErrorBody> {
  return (await response.json()) as ApiErrorBody;
}

describe('apiError', () => {
  it.each([
    ['unauthenticated', 401],
    ['forbidden', 403],
    ['not_found', 404],
    ['invalid_input', 400],
    ['conflict', 409],
    ['companion_mode_required', 409],
    ['seeker_mode_required', 409],
    ['internal_error', 500],
  ] as const)('maps %s to status %i', async (code, status) => {
    const response = apiError(code, 'msg');
    expect(response.status).toBe(status);
    const body = await bodyOf(response);
    expect(body.error.code).toBe(code);
    expect(body.error.message).toBe('msg');
    expect(body.error).not.toHaveProperty('details');
  });

  it('omits the details key when undefined and includes it when present', async () => {
    const without = await bodyOf(apiError('invalid_input', 'm'));
    expect(without.error).not.toHaveProperty('details');

    const withDetails = await bodyOf(
      apiError('invalid_input', 'm', { fieldErrors: { rate: ['too low'] } }),
    );
    expect(withDetails.error.details).toEqual({
      fieldErrors: { rate: ['too low'] },
    });
  });

  it('always returns Content-Type: application/json', async () => {
    const response = apiError('not_found', 'gone');
    expect(response.headers.get('content-type')).toMatch(/application\/json/);
  });
});

describe('error envelope shape', () => {
  // The QA agent spec mentions "{ error: string, code: string }". The
  // actual frozen contract (CONTRACT.md) is the NESTED form
  // { error: { code, message, details? } } — every body produced by
  // apiError matches this shape, and the Frontend switches on
  // `error.code`. We pin both invariants below so a future flattening
  // attempt fails loudly.

  it('every code maps to the documented nested envelope', async () => {
    const codes: ApiErrorCode[] = [
      'unauthenticated',
      'forbidden',
      'not_found',
      'invalid_input',
      'conflict',
      'companion_mode_required',
      'seeker_mode_required',
      'internal_error',
    ];
    for (const code of codes) {
      const body = await bodyOf(apiError(code, 'm'));
      expect(typeof body.error).toBe('object');
      expect(typeof body.error.code).toBe('string');
      expect(typeof body.error.message).toBe('string');
    }
  });

  it('exports the standard codes the prompt enumerates (UNAUTHORIZED, FORBIDDEN, NOT_FOUND, VALIDATION_ERROR, INTERNAL_ERROR)', async () => {
    // We carry these under their snake_case / domain names; the contract
    // documents the mapping. The test asserts the well-known semantics
    // exist somewhere in the codebase so a rename can't silently drop one.
    const expected: Array<{ code: ApiErrorCode; status: number }> = [
      { code: 'unauthenticated', status: 401 }, // UNAUTHORIZED
      { code: 'forbidden', status: 403 }, // FORBIDDEN
      { code: 'not_found', status: 404 }, // NOT_FOUND
      { code: 'invalid_input', status: 400 }, // VALIDATION_ERROR
      { code: 'internal_error', status: 500 }, // INTERNAL_ERROR
    ];
    for (const { code, status } of expected) {
      const response = apiError(code, 'm');
      expect(response.status).toBe(status);
      const body = await bodyOf(response);
      expect(body.error.code).toBe(code);
    }
  });
});
