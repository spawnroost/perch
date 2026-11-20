import {
  PSN_BUSY_HELP,
  PSN_COOLDOWN_HELP,
  PSN_NOT_CONFIGURED_HELP,
  PSN_NOT_FOUND_HELP,
  PSN_NOT_LINKED_HELP,
  PSN_PRIVATE_HELP,
  PSN_UNAVAILABLE_HELP,
} from '@perch/core/browser';

/** The PlayStation routes answer `{ error: <code> }`; the API client keeps the code as the message. */
export function psnErrorText(err: unknown): string {
  if (!(err instanceof Error)) return 'PlayStation sync failed. Try again.';
  switch (err.message) {
    case 'psn_private':
      return PSN_PRIVATE_HELP;
    case 'psn_not_found':
      return PSN_NOT_FOUND_HELP;
    case 'psn_not_configured':
      return PSN_NOT_CONFIGURED_HELP;
    case 'psn_unavailable':
      return PSN_UNAVAILABLE_HELP;
    case 'psn_not_linked':
      return PSN_NOT_LINKED_HELP;
    case 'psn_cooldown':
      return PSN_COOLDOWN_HELP;
    case 'psn_busy':
      return PSN_BUSY_HELP;
    default:
      return err.message;
  }
}
