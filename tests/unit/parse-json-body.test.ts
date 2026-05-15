// Unit tests for parseJsonBody — the route-handler glue between
// `request.json()` and a zod schema. It is the only path through which
// caller-supplied JSON enters the profiles API, so its failure modes
// are part of the authorization story (server-side input validation).

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { parseJsonBody } from '@/app/api/profiles/_lib/parse';

function fakeRequest(body: unknown, opts: { malformedJson?: boolean } = {}): NextRequest {
  return {
    json: async () => {
      if (opts.malformedJson) throw new Error('bad json');
      return body;
    },
  } as unknown as NextRequest;
}

const schema = z.object({ rate_cents: z.number().int().min(500).max(20000) });

describe('parseJsonBody', () => {
  it('returns ok=true with the parsed payload on success', async () => {
    const result = await parseJsonBody(fakeRequest({ rate_cents: 2500 }), schema);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.rate_cents).toBe(2500);
  });

  it('returns 400 invalid_input with a generic message when the body is not JSON', async () => {
    const result = await parseJsonBody(fakeRequest(undefined, { malformedJson: true }), schema);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(400);
    const body = await result.response.json();
    expect(body.error.code).toBe('invalid_input');
    expect(body.error).not.toHaveProperty('details');
  });

  it('returns 400 invalid_input with ZodError.flatten() on schema failure', async () => {
    const result = await parseJsonBody(fakeRequest({ rate_cents: 1 }), schema);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(400);
    const body = await result.response.json();
    expect(body.error.code).toBe('invalid_input');
    expect(body.error.details).toMatchObject({
      fieldErrors: { rate_cents: expect.any(Array) },
    });
  });
});
