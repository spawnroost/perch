import { STEAM_PRIVATE_HELP, type SteamSyncResult } from '@perch/core';

/** "Synced 3 h ago" for the Steam section; `iso` is the API's `steamSyncedAt`. */
export function syncedAgo(iso: string | null, now: Date): string {
  if (!iso) return 'Never synced';
  const ms = Math.max(0, now.getTime() - new Date(iso).getTime());
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'Synced just now';
  if (min < 60) return `Synced ${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `Synced ${h} h ago`;
  const d = Math.floor(h / 24);
  return `Synced ${d} ${d === 1 ? 'day' : 'days'} ago`;
}

export function steamSyncSummary({ imported, updated, unmatched, total }: SteamSyncResult): string {
  const base = `Imported ${imported} new and updated ${updated} of ${total} games.`;
  return unmatched > 0 ? `${base} ${unmatched} could not be matched.` : base;
}

/** The sync endpoint answers `{ error: <code> }`; the API client keeps the code as the message. */
export function steamSyncErrorText(err: unknown): string {
  if (!(err instanceof Error)) return 'Steam sync failed. Try again.';
  switch (err.message) {
    case 'steam_profile_private':
      return STEAM_PRIVATE_HELP;
    case 'steam_not_configured':
      return 'Steam library sync is not set up on this server.';
    case 'steam_unavailable':
      return 'Steam could not be reached. Try again in a moment.';
    case 'steam_not_linked':
      return 'Link your Steam account before syncing.';
    default:
      return err.message;
  }
}
