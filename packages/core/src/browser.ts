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
export { PLAYED_BEFORE_MIN_MINUTES, playedBeforeSchema } from './library/played-before.js';
export type { PlayedBefore } from './library/played-before.js';
export { shouldAutoSync } from './steam-library/status.js';
export type { FeedbackKind } from './engine/types.js';
export { parseLibraryExport } from './library-export/parse.js';
export type { ExportFile, ParsedExport } from './library-export/parse.js';
export {
  EXPORT_MAX_GAMES,
  EXPORT_SOURCES,
  EXPORT_UNMATCHED_SHOWN,
  exportGameSchema,
  exportImportResultSchema,
  exportImportSchema,
} from './library-export/schemas.js';
export type { ExportGame, ExportImportResult } from './library-export/schemas.js';
export {
  XBOX_BUSY_HELP,
  XBOX_COOLDOWN_HELP,
  XBOX_NOT_CONFIGURED_HELP,
  XBOX_NOT_FOUND_HELP,
  XBOX_NOT_LINKED_HELP,
  XBOX_PRIVATE_HELP,
  XBOX_SYNC_ERROR_CODES,
  XBOX_UNAVAILABLE_HELP,
  xboxLinkSchema,
  xboxSyncErrorSchema,
  xboxSyncResultSchema,
} from './xbox-library/schemas.js';
export type { XboxSyncError, XboxSyncErrorCode, XboxSyncResult } from './xbox-library/schemas.js';
