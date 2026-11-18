import { z } from 'zod';

/** `IPlayerService/GetOwnedGames/v1` reply. `games` is absent when game details are private. */
export const steamOwnedGamesResponseSchema = z.object({
  response: z.object({
    game_count: z.number().int().optional(),
    games: z
      .array(
        z.object({
          appid: z.number().int(),
          playtime_forever: z.number().nonnegative().optional(),
          /** Unix seconds; 0 when never played. */
          rtime_last_played: z.number().nonnegative().optional(),
        }),
      )
      .optional(),
  }),
});

export interface OwnedGame {
  appid: number;
  playtimeMinutes: number;
  lastPlayed: Date | null;
}

export const steamSyncResultSchema = z.object({
  imported: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  unmatched: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});
export type SteamSyncResult = z.infer<typeof steamSyncResultSchema>;

/** Error codes of `POST /api/library/steam/sync`. */
export const STEAM_SYNC_ERROR_CODES = [
  'steam_not_linked',
  'steam_profile_private',
  'steam_not_configured',
  'steam_unavailable',
] as const;
export type SteamSyncErrorCode = (typeof STEAM_SYNC_ERROR_CODES)[number];

export const steamSyncErrorSchema = z.object({
  error: z.enum(STEAM_SYNC_ERROR_CODES),
  message: z.string(),
});
export type SteamSyncError = z.infer<typeof steamSyncErrorSchema>;

export const STEAM_PRIVATE_HELP =
  'Your Steam game details are private. In Steam open Privacy Settings and set Game details to Public, then sync again.';
