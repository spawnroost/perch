import { describe, expect, it } from 'vitest';
import {
  fetchOwnedGames,
  SteamNetworkError,
  SteamNotConfiguredError,
  SteamProfilePrivateError,
} from '../../src/index.js';

const reply = (body: unknown, status = 200) =>
  (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;

const ID = '76561198000000001';

describe('fetchOwnedGames', () => {
  it('maps games and sends the documented query', async () => {
    let url = '';
    const fetchStub = (async (input: string | URL | Request) => {
      url = String(input);
      return new Response(
        JSON.stringify({
          response: {
            game_count: 2,
            games: [
              { appid: 10, playtime_forever: 90, rtime_last_played: 1_700_000_000 },
              { appid: 20, playtime_forever: 0, rtime_last_played: 0 },
            ],
          },
        }),
      );
    }) as unknown as typeof fetch;
    const games = await fetchOwnedGames(ID, { apiKey: 'k', fetch: fetchStub });
    expect(games).toEqual([
      { appid: 10, playtimeMinutes: 90, lastPlayed: new Date(1_700_000_000_000) },
      { appid: 20, playtimeMinutes: 0, lastPlayed: null },
    ]);
    const u = new URL(url);
    expect(u.pathname).toBe('/IPlayerService/GetOwnedGames/v1/');
    expect(u.searchParams.get('steamid')).toBe(ID);
    expect(u.searchParams.get('key')).toBe('k');
    expect(u.searchParams.get('include_appinfo')).toBe('0');
    expect(u.searchParams.get('include_played_free_games')).toBe('1');
  });

  it('treats a response without a games key as a private profile', async () => {
    await expect(
      fetchOwnedGames(ID, { apiKey: 'k', fetch: reply({ response: {} }) }),
    ).rejects.toBeInstanceOf(SteamProfilePrivateError);
  });

  it('returns an empty list for a public profile that owns nothing', async () => {
    const f = reply({ response: { game_count: 0, games: [] } });
    expect(await fetchOwnedGames(ID, { apiKey: 'k', fetch: f })).toEqual([]);
  });

  it('throws a config error when the key is missing', async () => {
    await expect(
      fetchOwnedGames(ID, { apiKey: undefined, fetch: reply({}) }),
    ).rejects.toBeInstanceOf(SteamNotConfiguredError);
    await expect(fetchOwnedGames(ID, { apiKey: '', fetch: reply({}) })).rejects.toBeInstanceOf(
      SteamNotConfiguredError,
    );
  });

  it('wraps network failures and bad statuses', async () => {
    const boom = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    await expect(fetchOwnedGames(ID, { apiKey: 'k', fetch: boom })).rejects.toBeInstanceOf(
      SteamNetworkError,
    );
    await expect(
      fetchOwnedGames(ID, { apiKey: 'k', fetch: reply({}, 503) }),
    ).rejects.toBeInstanceOf(SteamNetworkError);
  });

  it('wraps an unreadable body', async () => {
    const bad = (async () => new Response('<html>')) as unknown as typeof fetch;
    await expect(fetchOwnedGames(ID, { apiKey: 'k', fetch: bad })).rejects.toBeInstanceOf(
      SteamNetworkError,
    );
  });
});
