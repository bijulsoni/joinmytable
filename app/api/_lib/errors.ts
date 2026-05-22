import { NextResponse } from 'next/server';

// Shared API error envelope.
//
// Every Konnly API route returns either a 2xx success body (shape
// documented per-endpoint in the module's CONTRACT.md) or this envelope.
//
// `code` is a stable machine-readable string the Frontend can switch on;
// `message` is user-presentable English; `details` is reserved for 400
// validation responses (carries `ZodError.flatten()`).

export type ApiErrorCode =
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'invalid_input'
  | 'conflict'
  | 'companion_mode_required'
  | 'seeker_mode_required'
  | 'internal_error';

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
  };
}

const STATUS: Record<ApiErrorCode, number> = {
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  invalid_input: 400,
  conflict: 409,
  companion_mode_required: 409,
  seeker_mode_required: 409,
  internal_error: 500,
};

export function apiError(
  code: ApiErrorCode,
  message: string,
  details?: unknown,
): NextResponse<ApiErrorBody> {
  const body: ApiErrorBody = {
    error: details === undefined ? { code, message } : { code, message, details },
  };
  return NextResponse.json(body, { status: STATUS[code] });
}
