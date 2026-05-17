// Shared types & enums for JoinMyTable.
//
// Owner: Database agent.
//
// CONTRACT: every other agent imports entity row/insert/update shapes
// and enum string-literal types from here rather than redefining them.
// The shapes are derived from `supabase/migrations/`; any change here
// must accompany a migration in the same PR.
//
// enums.ts re-exports the activity-type union and metadata from
// activity.ts, so `import { ActivityType } from '@/lib/types'` works
// without us having to wildcard-export activity.ts here (which would
// collide with enums.ts's re-exports).

export * from './enums';
export * from './database';
