import { NextResponse } from 'next/server';

// Profile API error envelope.
//
// Every route handler returns either:
//   - a success body documented per-endpoint in CONTRACT.md, or
//   - `{ error: { code, message, details? } }` with an HTTP status code.
//
// `code` is a stable machine-readable string the Frontend agent can switch
// on; `message` is user-presentable English; `details` is optional and
// only used for validation responses (field-level issues).

export type ApiErrorCode =
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'invalid_input'
  | 'conflict'
  | 'companion_mode_required'
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
