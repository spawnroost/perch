import { afterEach, describe, expect, it, vi } from 'vitest';
import { createIgdbClient, IgdbError } from '../../src/igdb/client.js';
import { fakeFetch, fixture, fixtures, json } from './helpers.js';

const make = (net: ReturnType<typeof fakeFetch>, extra = {}) =>
  createIgdbClient({
    clientId: 'id',
    clientSecret: 'secret',
    fetch: net.fetch,
    maxPerSecond: 1000,
    backoffMs: 1,
    ...extra,
  });

afterEach(() => vi.useRealTimers());

describe('token handling', () => {
  it('fetches one token and reuses it', async () => {
    const net = fakeFetch();
    const client = make(net);
    await client.getGame(fixture('Hades').igdbId);
    await client.getGame(fixture('Celeste').igdbId);
    expect(net.tokenCalls()).toHaveLength(1);
    expect(net.apiCalls().map((c) => c.auth)).toEqual(['Bearer token-1', 'Bearer token-1']);
    expect(net.apiCalls()[0]?.url).toBe('https://api.igdb.com/v4/games');
  });

  it('shares one token request between concurrent calls', async () => {
    const net = fakeFetch();
    const client = make(net);
    await Promise.all([client.searchGames('Hades'), client.searchGames('Celeste')]);
    expect(net.tokenCalls()).toHaveLength(1);
  });

  it('refreshes shortly before the token expires', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const net = fakeFetch({ expiresIn: 3600 });
    const client = make(net);
    await client.getGame(fixture('Hades').igdbId);
    vi.advanceTimersByTime(54 * 60 * 1000); // 6 min left, outside the 5 min margin
    await client.getGame(fixture('Hades').igdbId);
    expect(net.tokenCalls()).toHaveLength(1);
    vi.advanceTimersByTime(2 * 60 * 1000); // 4 min left
    await client.getGame(fixture('Hades').igdbId);
    expect(net.tokenCalls()).toHaveLength(2);
    expect(net.apiCalls().at(-1)?.auth).toBe('Bearer token-2');
  });

  it('refreshes and retries once on a 401', async () => {
    const net = fakeFetch({
      intercept: (c) => (c.n === 1 ? new Response('unauthorized', { status: 401 }) : undefined),
    });
    const game = await make(net).getGame(fixture('Hades').igdbId);
    expect(game?.name).toBe('Hades');
    expect(net.tokenCalls()).toHaveLength(2);
    expect(net.apiCalls().map((c) => c.auth)).toEqual(['Bearer token-1', 'Bearer token-2']);
  });

  it('gives up if the 401 persists after a refresh', async () => {
    const net = fakeFetch({ intercept: () => new Response('no', { status: 401 }) });
    await expect(make(net).getGame(1)).rejects.toMatchObject({ name: 'IgdbError', status: 401 });
    expect(net.apiCalls()).toHaveLength(2);
  });
});

describe('retry and backoff', () => {
  it('retries 429 and 5xx, then succeeds', async () => {
    const statuses = [429, 503];
    const net = fakeFetch({
      intercept: (c) => (c.n <= 2 ? new Response('', { status: statuses[c.n - 1] }) : undefined),
    });
    const game = await make(net).getGame(fixture('Celeste').igdbId);
    expect(game?.name).toBe('Celeste');
    expect(net.apiCalls()).toHaveLength(3);
  });

  it('honours Retry-After', async () => {
    vi.useFakeTimers();
    const net = fakeFetch({
      intercept: (c) =>
        c.n === 1 ? new Response('', { status: 429, headers: { 'retry-after': '3' } }) : undefined,
    });
    const p = make(net, { maxPerSecond: 4 }).getGame(fixture('Celeste').igdbId);
    await vi.advanceTimersByTimeAsync(2900);
    expect(net.apiCalls()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(200);
    await expect(p).resolves.toMatchObject({ name: 'Celeste' });
  });

  it('throws after maxRetries and does not retry 4xx', async () => {
    const always503 = fakeFetch({ intercept: () => new Response('', { status: 503 }) });
    await expect(make(always503, { maxRetries: 2 }).getGame(1)).rejects.toBeInstanceOf(IgdbError);
    expect(always503.apiCalls()).toHaveLength(3);

    const bad = fakeFetch({ intercept: () => new Response('', { status: 400 }) });
    await expect(make(bad).getGame(1)).rejects.toMatchObject({ status: 400 });
    expect(bad.apiCalls()).toHaveLength(1);
  });
});

describe('searchGames', () => {
  it('picks the best match by total_rating_count, not IGDB order', async () => {
    const f = fixture('Hades');
    const { best, candidates } = await make(fakeFetch()).searchGames('Hades');
    expect(best?.igdbId).toBe(f.igdbId);
    expect(best?.name).toBe('Hades');
    expect(candidates.length).toBe(f.search.length);
    const counts = candidates.map((c) => c.ratingCount);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
  });

  it('picks the most-rated candidate when a junk duplicate comes first', async () => {
    const net = fakeFetch({
      intercept: () =>
        json([
          { id: 1, name: 'Hades (junk)', total_rating_count: 2 },
          { id: 2, name: 'Hades', total_rating_count: 1800 },
          { id: 3, name: 'Hades (no ratings)' },
        ]),
    });
    const { best, candidates } = await make(net).searchGames('Hades');
    expect(best?.igdbId).toBe(2);
    expect(candidates.map((c) => c.igdbId)).toEqual([2, 1, 3]);
  });

  it('returns best = null when nothing matches', async () => {
    const res = await make(fakeFetch()).searchGames('zzz no such game');
    expect(res).toEqual({ best: null, candidates: [] });
  });

  it('escapes quotes so the query stays well-formed', async () => {
    const net = fakeFetch();
    await make(net).searchGames('Baldur"s; Gate');
    expect(net.apiCalls()[0]?.body).toMatch(/^search "Baldur s; Gate";/);
  });
});

describe('getGame', () => {
  it.each([
    ['Hades', 1145360],
    ['Hollow Knight', 367520],
    ['Elden Ring', 1245620],
    ['Stardew Valley', 413150],
    ['Celeste', 504230],
  ])('extracts the Steam app id for %s', async (name, steamId) => {
    const game = await make(fakeFetch()).getGame(fixture(name).igdbId);
    expect(game?.steamAppId).toBe(steamId);
  });

  it('maps all fields', async () => {
    const f = fixture('Hades');
    const raw = f.game[0] as {
      genres: number[];
      similar_games: number[];
      cover: { image_id: string };
    };
    const game = await make(fakeFetch()).getGame(f.igdbId);
    expect(game).toMatchObject({
      igdbId: f.igdbId,
      name: 'Hades',
      slug: (f.game[0] as { slug: string }).slug,
      genres: raw.genres,
      similarIds: raw.similar_games,
    });
    expect(game?.coverUrl).toBe(
      `https://images.igdb.com/igdb/image/upload/t_cover_big/${raw.cover.image_id}.jpg`,
    );
    expect(game?.firstRelease).toBeInstanceOf(Date);
    expect(game?.rating).toBeGreaterThan(80);
    expect(game?.ratingCount).toBeGreaterThan(100);
    for (const k of ['themes', 'keywords', 'platforms', 'perspectives', 'gameModes'] as const) {
      expect(game?.[k].length).toBeGreaterThan(0);
    }
  });

  it('ignores non-Steam sources and uses null / [] for missing fields', async () => {
    const net = fakeFetch({
      intercept: () =>
        json([
          {
            id: 9,
            name: 'Obscure',
            slug: 'obscure',
            external_games: [
              { uid: '777', external_game_source: 5 },
              { uid: 'not-a-number', external_game_source: 1 },
            ],
          },
        ]),
    });
    const game = await make(net).getGame(9);
    expect(game).toMatchObject({
      steamAppId: null,
      coverUrl: null,
      firstRelease: null,
      rating: null,
      genres: [],
    });
  });

  it('returns null for an unknown id and rejects malformed responses', async () => {
    expect(await make(fakeFetch()).getGame(424242)).toBeNull();
    const bad = fakeFetch({ intercept: () => json([{ id: 'x', name: 5 }]) });
    await expect(make(bad).getGame(1)).rejects.toThrow();
  });

  it('every fixture parses', async () => {
    const client = make(fakeFetch());
    for (const f of fixtures) expect((await client.getGame(f.igdbId))?.name).toBe(f.name);
  });
});

describe('getTimeToBeat', () => {
  it('returns hastily / normally / completely seconds and count', async () => {
    const f = fixture('Celeste');
    const raw = f.timeToBeat[0] as { hastily: number; normally: number; completely: number };
    const ttb = await make(fakeFetch()).getTimeToBeat(f.igdbId);
    expect(ttb).toEqual({
      hastilySeconds: raw.hastily,
      normallySeconds: raw.normally,
      completelySeconds: raw.completely,
      count: 17,
    });
  });

  it('returns null when IGDB has no record', async () => {
    expect(await make(fakeFetch()).getTimeToBeat(424242)).toBeNull();
  });
});

describe('getGames', () => {
  const byIds = (body: string) =>
    (/where id = \(?([\d,]+)/.exec(body)?.[1] ?? '').split(',').map(Number);

  it('fetches ids in one query, deduped, and maps like getGame', async () => {
    const hades = fixture('Hades');
    const celeste = fixture('Celeste');
    const net = fakeFetch({
      intercept: ({ body }) => {
        const ids = byIds(body);
        return json(fixtures.filter((f) => ids.includes(f.igdbId)).flatMap((f) => f.game));
      },
    });
    const client = make(net);
    const list = await client.getGames([hades.igdbId, celeste.igdbId, hades.igdbId]);
    expect(list.map((g) => g.igdbId).sort()).toEqual([celeste.igdbId, hades.igdbId].sort());
    expect(list.find((g) => g.igdbId === hades.igdbId)).toEqual(await client.getGame(hades.igdbId));
    const first = net.apiCalls()[0]!;
    expect(first.body).toContain('limit 500');
    expect(byIds(first.body)).toEqual([hades.igdbId, celeste.igdbId]);
  });

  it('batches at 500 ids per query', async () => {
    const net = fakeFetch({ intercept: () => json([]) });
    const ids = Array.from({ length: 1201 }, (_, i) => i + 1);
    expect(await make(net).getGames(ids)).toEqual([]);
    const sizes = net.apiCalls().map((c) => byIds(c.body).length);
    expect(sizes).toEqual([500, 500, 201]);
  });

  it('makes no request for an empty list', async () => {
    const net = fakeFetch();
    expect(await make(net).getGames([])).toEqual([]);
    expect(net.apiCalls()).toHaveLength(0);
  });
});

describe('queryByTags', () => {
  it('queries genres/themes with a rating-count floor, most-rated first', async () => {
    const hades = fixture('Hades');
    const net = fakeFetch({ intercept: () => json(hades.game) });
    const list = await make(net).queryByTags({
      genres: [12, 31],
      themes: [17],
      minRatingCount: 50,
      limit: 100,
    });
    expect(list.map((g) => g.igdbId)).toEqual([hades.igdbId]);
    const { body } = net.apiCalls()[0]!;
    expect(body).toContain('(genres = (12,31) | themes = (17))');
    expect(body).toContain('total_rating_count >= 50');
    expect(body).toContain('game_type = 0');
    expect(body).toContain('sort total_rating desc');
    expect(body).toContain('limit 100;');
  });

  it('caps the limit at 500 and skips the request when there are no tags', async () => {
    const net = fakeFetch({ intercept: () => json([]) });
    const client = make(net);
    await client.queryByTags({ genres: [12], themes: [], minRatingCount: 50, limit: 9999 });
    expect(net.apiCalls()[0]!.body).toContain('limit 500;');
    expect(net.apiCalls()[0]!.body).not.toContain('themes =');
    expect(
      await client.queryByTags({ genres: [], themes: [], minRatingCount: 50, limit: 10 }),
    ).toEqual([]);
    expect(net.apiCalls()).toHaveLength(1);
  });
});

describe('keywordNames', () => {
  it('maps keyword ids to names from the keywords endpoint, deduped', async () => {
    const net = fakeFetch({
      intercept: ({ url }) =>
        url.endsWith('/keywords')
          ? json([
              { id: 11, name: 'open world' },
              { id: 22, name: 'permadeath' },
            ])
          : undefined,
    });
    const names = await make(net).keywordNames([11, 22, 11]);
    expect(names).toEqual({ 11: 'open world', 22: 'permadeath' });
    const call = net.apiCalls()[0]!;
    expect(call.url).toBe('https://api.igdb.com/v4/keywords');
    expect(call.body).toBe('fields id,name; where id = (11,22); limit 500;');
  });

  it('returns {} without a request for no ids', async () => {
    const net = fakeFetch();
    expect(await make(net).keywordNames([])).toEqual({});
    expect(net.apiCalls()).toHaveLength(0);
  });

  it('batches more than 500 ids', async () => {
    const net = fakeFetch({ intercept: () => json([]) });
    await make(net).keywordNames(Array.from({ length: 501 }, (_, i) => i + 1));
    expect(net.apiCalls()).toHaveLength(2);
  });
});
