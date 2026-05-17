import type { NextRequest, NextResponse } from 'next/server';
import { ZodError, type ZodSchema } from 'zod';
import { apiError } from './errors';

/**
 * Read the JSON body of a route-handler request and validate it against
 * a zod schema. Returns either the parsed payload or a 400 response
 * describing the problem - no surprises bubble up to the route.
 */
export async function parseJsonBody<T>(
  request: NextRequest,
  schema: ZodSchema<T>,
): Promise<{ ok: true; data: T } | { ok: false; response: NextResponse }> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return {
      ok: false,
      response: apiError('invalid_input', 'Request body must be valid JSON.'),
    };
  }

  try {
    const data = schema.parse(raw);
    return { ok: true, data };
  } catch (err) {
    if (err instanceof ZodError) {
      return {
        ok: false,
        response: apiError('invalid_input', 'One or more fields are invalid.', err.flatten()),
      };
    }
    return {
      ok: false,
      response: apiError('invalid_input', 'Could not parse request body.'),
    };
  }
}
