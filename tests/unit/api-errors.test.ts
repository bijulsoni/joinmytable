// Unit tests for the profiles API error envelope.
//
// The Frontend agent switches on `error.code`; the human-readable
// `message` is rendered to the user; `details` carries
// `ZodError.flatten()` for validation failures. The status code mapping
// is part of the frozen contract — any change here is a breaking change.

import { describe, it, expect } from 'vitest';
import { apiError, type ApiErrorBody } from '@/app/api/profiles/_lib/errors';

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

    const with_ = await bodyOf(apiError('invalid_input', 'm', { fieldErrors: { rate_cents: ['too low'] } }));
    expect(with_.error.details).toEqual({ fieldErrors: { rate_cents: ['too low'] } });
  });
});
