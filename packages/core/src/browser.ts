/**
 * Browser-safe entry for apps/web. Re-exports only zod schemas, types and pure helpers; nothing
 * here may reach `@perch/db` (root), `postgres`, `node:*` or server clients (guarded by
 * test/browser-entry.test.ts). Server code keeps importing from '@perch/core'.
 */
export * from './schemas/index.js';
export * from './steam-auth/index.js';
export * from './social-auth/index.js';
export {
  STEAM_NOT_CONFIGURED_HELP,
  STEAM_NOT_LINKED_HELP,
  STEAM_PRIVATE_HELP,
  STEAM_UNAVAILABLE_HELP,
  STEAM_SYNC_ERROR_CODES,
  steamSyncErrorSchema,
  steamSyncResultSchema,
} from './steam-library/schemas.js';
export type {
  SteamSyncError,
  SteamSyncErrorCode,
  SteamSyncResult,
} from './steam-library/schemas.js';
export type { FeedbackKind } from './engine/types.js';
