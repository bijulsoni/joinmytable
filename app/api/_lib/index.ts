// Barrel for shared Core API utilities. Module-local code should import
// from here rather than reaching into individual files.

export { apiError, type ApiErrorBody, type ApiErrorCode } from './errors';
export { parseJsonBody } from './parse';
export { apiServerClient, apiAdminClient, type LooseSupabaseClient } from './supabase';
export {
  requireAuth,
  requireVerifiedCompanion,
  type AuthedCaller,
  type AuthResult,
} from './auth-guard';
export {
  activityTypeSchema,
  activityTypesArraySchema,
  budgetTierSchema,
  geoJSONPointSchema,
  isoTimestampSchema,
  uuidSchema,
} from './validators';
