import {
  XBOX_BUSY_HELP,
  XBOX_NOT_CONFIGURED_HELP,
  XBOX_NOT_FOUND_HELP,
  XBOX_NOT_LINKED_HELP,
  XBOX_PRIVATE_HELP,
  XBOX_UNAVAILABLE_HELP,
} from '@perch/core/browser';

/** The Xbox routes answer `{ error: <code> }`; the API client keeps the code as the message. */
export function xboxErrorText(err: unknown): string {
  if (!(err instanceof Error)) return 'Xbox sync failed. Try again.';
  switch (err.message) {
    case 'xbox_private':
      return XBOX_PRIVATE_HELP;
    case 'xbox_not_found':
      return XBOX_NOT_FOUND_HELP;
    case 'xbox_not_configured':
      return XBOX_NOT_CONFIGURED_HELP;
    case 'xbox_unavailable':
      return XBOX_UNAVAILABLE_HELP;
    case 'xbox_not_linked':
      return XBOX_NOT_LINKED_HELP;
    case 'xbox_busy':
      return XBOX_BUSY_HELP;
    default:
      return err.message;
  }
}
