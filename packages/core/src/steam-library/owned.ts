import { SteamNetworkError, SteamNotConfiguredError, SteamProfilePrivateError } from './errors.js';
import { steamOwnedGamesResponseSchema, type OwnedGame } from './schemas.js';

const ENDPOINT = 'https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/';

export interface FetchOwnedOptions {
  apiKey: string | undefined;
  /** Injected in tests; defaults to the global fetch. */
  fetch?: typeof fetch;
}

/** The user's owned games with playtime. Throws a typed error for a private profile, a missing key or a network failure. */
export async function fetchOwnedGames(
  steamId: string,
  { apiKey, fetch: doFetch = (...a) => fetch(...a) }: FetchOwnedOptions,
): Promise<OwnedGame[]> {
  if (!apiKey) throw new SteamNotConfiguredError();
  const url = new URL(ENDPOINT);
  url.search = new URLSearchParams({
    key: apiKey,
    steamid: steamId,
    include_appinfo: '0',
    include_played_free_games: '1',
    format: 'json',
  }).toString();

  let res: Response;
  try {
    res = await doFetch(url.toString());
  } catch (err) {
    throw new SteamNetworkError(`Steam request failed: ${(err as Error).message}`);
  }
  if (!res.ok) throw new SteamNetworkError(`Steam answered HTTP ${res.status}`, res.status);

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new SteamNetworkError('Steam sent an unreadable reply');
  }
  const parsed = steamOwnedGamesResponseSchema.safeParse(body);
  if (!parsed.success) throw new SteamNetworkError('Steam sent an unexpected reply');
  const { games, game_count } = parsed.data.response;
  if (!games) {
    if (game_count === 0) return [];
    throw new SteamProfilePrivateError();
  }
  return games.map((g) => ({
    appid: g.appid,
    playtimeMinutes: g.playtime_forever ?? 0,
    lastPlayed: g.rtime_last_played ? new Date(g.rtime_last_played * 1000) : null,
  }));
}
