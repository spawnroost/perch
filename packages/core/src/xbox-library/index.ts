export { fetchTitleHistory, lookupXuid } from './client.js';
export type { XboxClientOptions } from './client.js';
export {
  XboxAccountChangedError,
  XboxGamertagNotFoundError,
  XboxNetworkError,
  XboxNotConfiguredError,
  XboxProfilePrivateError,
  XboxRateLimitedError,
} from './errors.js';
export {
  XBOX_BUSY_HELP,
  XBOX_NOT_CONFIGURED_HELP,
  XBOX_NOT_FOUND_HELP,
  XBOX_NOT_LINKED_HELP,
  XBOX_PRIVATE_HELP,
  XBOX_SYNC_ERROR_CODES,
  XBOX_UNAVAILABLE_HELP,
  xboxLinkSchema,
  xboxSearchResponseSchema,
  xboxSyncErrorSchema,
  xboxSyncResultSchema,
  xboxTitleHistoryResponseSchema,
} from './schemas.js';
export type {
  XboxProfile,
  XboxSyncError,
  XboxSyncErrorCode,
  XboxSyncResult,
  XboxTitle,
} from './schemas.js';
export { syncXboxLibrary } from './sync.js';
export type { XboxSyncDeps } from './sync.js';
export { cleanXboxTitle, toXboxTitles, xboxPlatform } from './titles.js';
