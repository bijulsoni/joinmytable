// Shared types & enums for JoinMyTable.
//
// Owner: Database agent.
//
// CONTRACT: Other agents import entity types and enum string-literal
// types from here rather than redefining them. The shapes are derived
// from `supabase/migrations/`. Any change here must accompany a
// migration.

export * from './enums';
export * from './database';
