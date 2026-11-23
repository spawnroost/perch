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

  it('maps the search cover to big and small urls, null without one', async () => {
    const net = fakeFetch({
      intercept: () =>
        json([
          { id: 1, name: 'Hades', total_rating_count: 9, cover: { image_id: 'c1' } },
          { id: 2, name: 'Hades II', total_rating_count: 1 },
        ]),
    });
    const img = (size: string, id: string) =>
      `https://images.igdb.com/igdb/image/upload/${size}/${id}.jpg`;
    const { candidates } = await make(net).searchGames('Hades');
    expect(candidates[0]?.coverUrl).toBe(img('t_cover_big', 'c1'));
    expect(candidates[0]?.coverUrlSmall).toBe(img('t_cover_small', 'c1'));
    expect(candidates[1]?.coverUrl).toBeNull();
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

  it('requests collections and franchises, and maps them to one series id list', async () => {
    const net = fakeFetch({
      intercept: () =>
        json([
          {
            id: 9,
            name: 'X',
            slug: 'x',
            collections: [{ id: 5, name: 'A' }, { id: 6 }],
            franchises: [5, { id: 7 }],
          },
        ]),
    });
    const game = await make(net).getGame(9);
    expect(game?.series).toEqual([5, 6, 1_000_005, 1_000_007]);
    expect(net.apiCalls()[0]?.body).toMatch(/collections\.name,franchises\.name/);
  });

  it('requests and maps the summary, null when IGDB has none', async () => {
    const net = fakeFetch({
      intercept: () =>
        json([
          { id: 9, name: 'X', slug: 'x', summary: 'A game.' },
          { id: 10, name: 'Y', slug: 'y' },
        ]),
    });
    const [x, y] = await make(net).getGames([9, 10]);
    expect(x?.summary).toBe('A game.');
    expect(y?.summary).toBeNull();
    expect(net.apiCalls()[0]?.body).toMatch(/summary/);
  });

  it('requests and maps the critic rating and store websites', async () => {
    const net = fakeFetch({
      intercept: () =>
        json([
          {
            id: 9,
            name: 'X',
            slug: 'x',
            aggregated_rating: 91.2,
            aggregated_rating_count: 14,
            websites: [
              { url: 'https://store.steampowered.com/app/5', type: 13 },
              { url: 'https://example.com', type: 1 },
            ],
          },
          { id: 10, name: 'Y', slug: 'y' },
        ]),
    });
    const [x, y] = await make(net).getGames([9, 10]);
    expect(x).toMatchObject({
      criticRating: 91.2,
      criticRatingCount: 14,
      websites: [{ store: 'steam', url: 'https://store.steampowered.com/app/5' }],
    });
    expect(y).toMatchObject({ criticRating: null, criticRatingCount: null, websites: [] });
    expect(net.apiCalls()[0]?.body).toMatch(
      /aggregated_rating,aggregated_rating_count,websites\.url,websites\.type/,
    );
  });

  it('requests and maps studios, multiplayer, DLC counts and the series name', async () => {
    const net = fakeFetch({
      intercept: () =>
        json([
          {
            id: 9,
            name: 'X',
            slug: 'x',
            involved_companies: [
              { company: { name: 'Dev Co' }, developer: true, publisher: false },
              { company: { name: 'Pub Co' }, developer: false, publisher: true },
            ],
            multiplayer_modes: [{ campaigncoop: true, onlinecoopmax: 4, splitscreen: true }],
            dlcs: [1, 2, 3],
            expansions: [4],
            collections: [{ id: 5, name: 'The X Series' }],
          },
          { id: 10, name: 'Y', slug: 'y' },
        ]),
    });
    const [x, y] = await make(net).getGames([9, 10], { full: true });
    expect(x).toMatchObject({
      developers: ['Dev Co'],
      publishers: ['Pub Co'],
      multiplayer: { campaign: true, online: false, onlineMax: 4, local: false, splitscreen: true },
      dlcCount: 3,
      expansionCount: 1,
      seriesName: 'The X Series',
    });
    expect(y).toMatchObject({
      developers: [],
      publishers: [],
      multiplayer: null,
      dlcCount: 0,
      expansionCount: 0,
      seriesName: null,
    });
    expect(net.apiCalls()[0]?.body).toMatch(
      /involved_companies\.company\.name,.*multiplayer_modes\.campaigncoop.*,dlcs,expansions/,
    );
  });

  it('series is [] when IGDB sends neither collections nor franchises', async () => {
    const net = fakeFetch({ intercept: () => json([{ id: 9, name: 'X', slug: 'x' }]) });
    expect((await make(net).getGame(9))?.series).toEqual([]);
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
      coverUrlSmall: null,
      heroUrl: null,
      accent: null,
      summary: null,
      firstRelease: null,
      rating: null,
      genres: [],
    });
  });

  describe('art', () => {
    const img = (size: string, id: string) =>
      `https://images.igdb.com/igdb/image/upload/${size}/${id}.jpg`;
    const one = (extra: Record<string, unknown>) =>
      fakeFetch({ intercept: () => json([{ id: 9, name: 'A', slug: 'a', ...extra }]) });

    it('requests artworks and screenshots', async () => {
      const net = fakeFetch();
      await make(net).getGame(fixture('Hades').igdbId);
      const body = net.apiCalls().at(-1)!.body;
      expect(body).toContain('artworks.image_id');
      expect(body).toContain('screenshots.image_id');
    });

    it('uses the first artwork for the hero, else the first screenshot, else null', async () => {
      const both = await make(
        one({
          artworks: [{ image_id: 'art1' }, { image_id: 'art2' }],
          screenshots: [{ image_id: 'shot1' }],
        }),
      ).getGame(9);
      expect(both?.heroUrl).toBe(img('t_1080p', 'art1'));
      const shotOnly = await make(one({ screenshots: [{ image_id: 'shot1' }] })).getGame(9);
      expect(shotOnly?.heroUrl).toBe(img('t_1080p', 'shot1'));
      expect((await make(one({})).getGame(9))?.heroUrl).toBeNull();
    });

    it('exposes a big and a small cover', async () => {
      const g = await make(one({ cover: { image_id: 'c1' } })).getGame(9);
      expect(g?.coverUrl).toBe(img('t_cover_big', 'c1'));
      expect(g?.coverUrlSmall).toBe(img('t_cover_small', 'c1'));
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

describe('lean and full field sets', () => {
  const HEAVY = /involved_companies|multiplayer_modes|dlcs|expansions|collections\.name/;
  it('getGame and getGames({ full }) request the About fields', async () => {
    const net = fakeFetch({ intercept: () => json([]) });
    const client = make(net);
    await client.getGame(1);
    await client.getGames([1], { full: true });
    for (const c of net.apiCalls()) expect(c.body).toMatch(HEAVY);
  });
  it('getGames and queryByTags are lean by default', async () => {
    const net = fakeFetch({ intercept: () => json([]) });
    const client = make(net);
    await client.getGames([1, 2]);
    await client.queryByTags({ genres: [12], themes: [], minRatingCount: 50, limit: 9 });
    expect(net.apiCalls()).toHaveLength(2);
    for (const c of net.apiCalls()) {
      expect(c.body).not.toMatch(HEAVY);
      expect(c.body).toMatch(/collections,franchises/);
    }
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

  it('restricts to platforms when asked', async () => {
    const net = fakeFetch({ intercept: () => json([]) });
    await make(net).queryByTags({
      genres: [12],
      themes: [],
      platforms: [39, 34],
      minRatingCount: 20,
      limit: 50,
    });
    const { body } = net.apiCalls()[0]!;
    expect(body).toContain('platforms = (39,34)');
    expect(body).toContain('total_rating_count >= 20');
    expect(body).toContain('game_type = 0');
  });

  it('fetches game_type and maps it to gameType', async () => {
    const hades = fixture('Hades');
    const net = fakeFetch({
      intercept: () => json(hades.game.map((g: object) => ({ ...g, game_type: 0 }))),
    });
    const [g] = await make(net).queryByTags({
      genres: [12],
      themes: [],
      minRatingCount: 50,
      limit: 5,
    });
    expect(net.apiCalls()[0]!.body).toContain('game_type');
    expect(g!.gameType).toBe(0);
  });

  it("match 'all' needs a genre and a theme at once", async () => {
    const net = fakeFetch({ intercept: () => json([]) });
    await make(net).queryByTags({
      genres: [12, 31],
      themes: [17],
      match: 'all',
      minRatingCount: 50,
      limit: 100,
    });
    expect(net.apiCalls()[0]!.body).toContain('(genres = (12,31) & themes = (17))');
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

describe('steamAppIds', () => {
  it('maps Steam appids to IGDB ids via external_games', async () => {
    const net = fakeFetch({
      intercept: ({ url }) =>
        url.endsWith('/external_games')
          ? json([
              { id: 1, uid: '10', game: 111 },
              { id: 2, uid: '10', game: 999 },
              { id: 3, uid: '20', game: 222 },
            ])
          : undefined,
    });
    const map = await make(net).steamAppIds([10, 20, 30, 10]);
    expect([...map]).toEqual([
      [10, 111],
      [20, 222],
    ]);
    const call = net.apiCalls()[0]!;
    expect(call.url).toBe('https://api.igdb.com/v4/external_games');
    expect(call.body).toContain('external_game_source = 1');
    expect(call.body).toContain('uid = ("10","20","30")');
  });

  it('pages with offset when duplicate rows fill the 500 limit', async () => {
    const page = (n: number, base: number) =>
      Array.from({ length: n }, (_, i) => ({ uid: String(base + (i % 250)), game: 1000 + i }));
    const net = fakeFetch({
      intercept: ({ url, body }) => {
        if (!url.endsWith('/external_games')) return undefined;
        const offset = Number(/offset (\d+)/.exec(body)?.[1] ?? 0);
        if (offset === 0) return json(page(500, 1));
        if (offset === 500) return json([{ uid: '400', game: 4000 }]);
        return json([]);
      },
    });
    const map = await make(net).steamAppIds(Array.from({ length: 400 }, (_, i) => i + 1));
    expect(net.apiCalls()).toHaveLength(2);
    expect(net.apiCalls()[1]!.body).toContain('offset 500');
    expect(map.get(400)).toBe(4000);
  });

  it('makes no request for no appids and batches 500 uids per query', async () => {
    const net = fakeFetch({ intercept: () => json([]) });
    const client = make(net);
    expect((await client.steamAppIds([])).size).toBe(0);
    expect(net.apiCalls()).toHaveLength(0);
    await client.steamAppIds(Array.from({ length: 1001 }, (_, i) => i + 1));
    expect(net.apiCalls()).toHaveLength(3);
  });
});

describe('externalGameIds', () => {
  it('queries the given source and maps uid strings to IGDB ids', async () => {
    const net = fakeFetch({
      intercept: ({ url }) =>
        url.endsWith('/external_games')
          ? json([
              { id: 1, uid: '1207658924', game: 111 },
              { id: 2, uid: '1207658924', game: 999 },
            ])
          : undefined,
    });
    const map = await make(net).externalGameIds(5, ['1207658924', 'x"y', '1207658924']);
    expect([...map]).toEqual([['1207658924', 111]]);
    const body = net.apiCalls()[0]!.body;
    expect(body).toContain('external_game_source = 5');
    expect(body).toContain('uid = ("1207658924","xy")');
  });
});

describe('gamesByExactName', () => {
  it('batches 50 names per query and maps rows', async () => {
    const net = fakeFetch({
      intercept: ({ url }) =>
        url.endsWith('/games')
          ? json([{ id: 7, name: 'Celeste', game_type: 0, first_release_date: 1516838400 }])
          : undefined,
    });
    const names = Array.from({ length: 101 }, (_, i) => (i === 0 ? 'Celeste' : `Game "${i}"`));
    const out = await make(net).gamesByExactName(names);
    expect(net.apiCalls()).toHaveLength(3);
    expect(net.apiCalls()[0]!.body).toContain('where name = ("Celeste","Game  1","Game  2"');
    expect(out[0]).toEqual({
      igdbId: 7,
      name: 'Celeste',
      gameType: 0,
      firstRelease: new Date(1516838400 * 1000),
      ratingCount: null,
    });
  });

  it('makes no request for no names', async () => {
    const net = fakeFetch({ intercept: () => json([]) });
    expect(await make(net).gamesByExactName([])).toEqual([]);
    expect(net.apiCalls()).toHaveLength(0);
  });
});
