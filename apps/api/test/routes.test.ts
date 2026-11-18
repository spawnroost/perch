import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import { hashPassword } from 'better-auth/crypto';
import {
  createVerifiedUser,
  deleteLibraryEntry,
  type DeckCategory,
  type Game,
  type IgdbClient,
  type RecommendationsResponse,
  type TagQuery,
} from '@perch/core';
import { schema } from '@perch/db';
import { cachedRecommendations } from '../src/recommendation-cache.js';
import { cookieFrom, json, setupApi, testUrl } from './harness.js';

const PASSWORD = 'correct-horse-battery';
const BASE = 2_100_000 + Math.floor(Math.random() * 100_000) * 10;
const [A, B, C, D] = [BASE + 1, BASE + 2, BASE + 3, BASE + 4];

function game(igdbId: number, name: string, extra: Partial<Game> = {}): Game {
  return {
    igdbId,
    name,
    slug: `route-test-${igdbId}`,
    coverUrl: null,
    coverUrlSmall: null,
    heroUrl: null,
    accent: null,
    summary: null,
    firstRelease: new Date('2020-01-01T00:00:00Z'),
    genres: [12],
    themes: [],
    keywords: [],
    perspectives: [],
    gameModes: [],
    platforms: [6],
    similarIds: [],
    series: [],
    rating: 80,
    ratingCount: 100,
    steamAppId: null,
    criticRating: null,
    criticRatingCount: null,
    websites: [],
    developers: [],
    publishers: [],
    multiplayer: null,
    dlcCount: 0,
    expansionCount: 0,
    seriesName: null,
    ...extra,
  };
}

const catalog = [
  game(A, 'Routetest Alpha', {
    similarIds: [B],
    steamAppId: 4_000_001,
    criticRating: 84.4,
    criticRatingCount: 12,
    websites: [{ store: 'gog', url: 'https://www.gog.com/game/alpha' }],
    developers: ['Alpha Studio'],
    publishers: ['Alpha Studio', 'Big Pub'],
    gameModes: [1, 3],
    perspectives: [2],
    multiplayer: { campaign: true, online: true, onlineMax: 4, local: false, splitscreen: false },
    dlcCount: 2,
    expansionCount: 1,
    seriesName: 'Alpha Saga',
    summary: 'An alpha summary.',
    heroUrl: 'https://img.test/alpha-hero.jpg',
    coverUrlSmall: 'https://img.test/alpha-small.jpg',
  }),
  game(B, 'Routetest Beta', {
    genres: [12, 31],
    platforms: [6, 167],
    coverUrl: 'https://img.test/beta.jpg',
    coverUrlSmall: 'https://img.test/beta-small.jpg',
  }),
  game(C, 'Routetest Gamma', { genres: [31], themes: [17] }),
  game(D, 'Routetest Delta', { genres: [5] }),
];

const tagQueries: TagQuery[] = [];

/** An IGDB client that never touches the network. */
const fakeIgdb: IgdbClient = {
  async searchGames(name) {
    const q = name.toLowerCase();
    const candidates = catalog
      .filter((g) => g.name.toLowerCase().includes(q))
      .map((g) => ({
        igdbId: g.igdbId,
        name: g.name,
        slug: g.slug,
        ratingCount: g.ratingCount ?? 0,
        firstRelease: g.firstRelease,
        coverUrl: g.coverUrl,
        coverUrlSmall: g.coverUrlSmall,
      }));
    return { best: candidates[0] ?? null, candidates };
  },
  async getGame(id) {
    return catalog.find((g) => g.igdbId === id) ?? null;
  },
  async getGames(ids) {
    return catalog.filter((g) => ids.includes(g.igdbId));
  },
  async queryByTags(q) {
    tagQueries.push(q);
    // Only browse asks for match 'all'; the recommendations keep an empty tag pool.
    if (q.match !== 'all') return [];
    const has = (have: number[], want: readonly number[]) =>
      want.length === 0 || have.some((id) => want.includes(id));
    return catalog.filter((g) => has(g.genres, q.genres) && has(g.themes, q.themes));
  },
  async getTimeToBeat(id) {
    return id === A
      ? { hastilySeconds: 3600, normallySeconds: 7200, completelySeconds: null, count: 50 }
      : null;
  },
  async keywordNames() {
    return {};
  },
  async steamAppIds() {
    return new Map();
  },
};

const deck: DeckCategory = 'verified';
const fakeSteam = {
  async getPcRequirements() {
    return {};
  },
  async getDeckCompat() {
    return deck;
  },
  async getReviewSummary() {
    return { desc: 'Very Positive', pct: 91, total: 1234 };
  },
};

const COLOURS: Record<string, string> = {
  'https://img.test/alpha-small.jpg': '#c81e28',
  'https://img.test/beta-small.jpg': '#2a6fdb',
};
const accentFor = async (url: string) => COLOURS[url] ?? null;

describe.skipIf(!testUrl)('api routes', () => {
  let ctx: Awaited<ReturnType<typeof setupApi>>;
  beforeAll(async () => {
    const big = { limit: 100_000, windowMs: 60_000 };
    ctx = await setupApi(
      { api: big, auth: big },
      {},
      { igdb: fakeIgdb, steam: fakeSteam, accentFor },
    );
  });
  afterAll(async () => {
    await ctx?.db.delete(schema.games).where(inArray(schema.games.igdbId, [A, B, C, D]));
    await ctx?.cleanup();
  });

  /** Accents are filled in the background after a game is cached; wait for the given games. */
  async function accentsFilled(...ids: number[]) {
    await vi.waitFor(async () => {
      const rows = await ctx.db
        .select({ accent: schema.games.accent })
        .from(schema.games)
        .where(inArray(schema.games.igdbId, ids));
      expect(rows).toHaveLength(ids.length);
      expect(rows.every((r) => r.accent !== null)).toBe(true);
    });
  }

  async function newUser() {
    const email = ctx.newEmail();
    const { id } = await createVerifiedUser(ctx.db, { email, password: PASSWORD }, hashPassword);
    const res = await ctx.app.request(
      '/api/auth/sign-in/email',
      json({ email, password: PASSWORD }),
    );
    expect(res.status).toBe(200);
    return { id, cookie: cookieFrom(res) };
  }

  function call(method: string, path: string, cookie?: string, body?: unknown) {
    return ctx.app.request(path, {
      method,
      headers: {
        ...(cookie ? { cookie } : {}),
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  }
  const get = (path: string, cookie?: string) => call('GET', path, cookie);

  describe('auth', () => {
    it.each([
      ['GET', '/api/games/search?q=alpha'],
      ['GET', `/api/games/${A}`],
      ['GET', `/api/games/fit?ids=${A}`],
      ['GET', '/api/library'],
      ['POST', '/api/library'],
      ['PATCH', `/api/library/${crypto.randomUUID()}`],
      ['DELETE', `/api/library/${crypto.randomUUID()}`],
      ['POST', '/api/library/import'],
      ['POST', '/api/library/import/confirm'],
      ['GET', '/api/devices'],
      ['POST', '/api/devices'],
      ['PATCH', `/api/devices/${crypto.randomUUID()}`],
      ['DELETE', `/api/devices/${crypto.randomUUID()}`],
      ['GET', '/api/recommendations'],
      ['GET', '/api/browse?genres=12'],
      ['GET', '/api/browse/facets'],
      ['GET', '/api/session?minutes=30'],
      ['GET', '/api/feedback'],
      ['POST', '/api/feedback'],
      ['DELETE', `/api/feedback/${C}/up`],
      ['POST', '/api/profile/rebuild'],
    ])('%s %s needs a session', async (method, path) => {
      expect((await call(method, path, undefined, method === 'GET' ? undefined : {})).status).toBe(
        401,
      );
    });
  });

  describe('games', () => {
    it('searches IGDB', async () => {
      const u = await newUser();
      const res = await get('/api/games/search?q=routetest', u.cookie);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { results: { igdbId: number }[] };
      expect(body.results.map((r) => r.igdbId).sort()).toEqual([A, B, C, D]);
    });

    it('rejects a search without q', async () => {
      const u = await newUser();
      expect((await get('/api/games/search', u.cookie)).status).toBe(400);
      expect((await get('/api/games/search?q=%20', u.cookie)).status).toBe(400);
    });

    it('shows detail with fit per device, deck category and why', async () => {
      const u = await newUser();
      expect((await call('POST', '/api/devices', u.cookie, { preset: 'steam-deck' })).status).toBe(
        201,
      );
      expect((await call('POST', '/api/devices', u.cookie, { preset: 'ps5' })).status).toBe(201);
      // An empty library explains nothing.
      const empty = await get(`/api/games/${A}`, u.cookie);
      expect(empty.status).toBe(200);
      expect(((await empty.json()) as { why: string[] }).why).toEqual([]);
      await accentsFilled(A);

      await call('POST', '/api/library', u.cookie, {
        igdbId: B,
        hoursPlayed: 30,
        status: 'playing',
      });
      const res = await get(`/api/games/${A}`, u.cookie);
      const body = (await res.json()) as {
        game: { igdbId: number; name: string };
        fit: { deviceName: string; status: string; reason: string }[];
        timeToBeat: unknown;
        deck: string;
        why: string[];
        facts: unknown;
      };
      expect(body.game).toMatchObject({
        igdbId: A,
        name: 'Routetest Alpha',
        summary: 'An alpha summary.',
        heroUrl: 'https://img.test/alpha-hero.jpg',
        accent: '#c81e28',
        coverUrlSmall: 'https://img.test/alpha-small.jpg',
      });
      expect(body.timeToBeat).toEqual({
        hastilyHours: 1,
        normallyHours: 2,
        completelyHours: null,
        submissions: 50,
      });
      expect(Object.fromEntries(body.fit.map((f) => [f.deviceName, f.reason]))).toEqual({
        'Steam Deck': 'Steam Deck Verified',
        'PlayStation 5': 'Not released on this device',
      });
      expect(body.deck).toBe('verified');
      expect(body.facts).toEqual({
        critic: { score: 84, count: 12 },
        steamReviews: { desc: 'Very Positive', pct: 91, total: 1234 },
        stores: [
          { store: 'steam', url: 'https://store.steampowered.com/app/4000001' },
          { store: 'gog', url: 'https://www.gog.com/game/alpha' },
        ],
        links: [
          { label: 'OpenCritic', url: 'https://opencritic.com/search?criteria=Routetest%20Alpha' },
          { label: 'Reddit', url: 'https://www.reddit.com/search/?q=Routetest%20Alpha' },
        ],
        about: {
          developers: ['Alpha Studio'],
          publishers: ['Alpha Studio', 'Big Pub'],
          modes: ['Single player', 'Co-operative'],
          perspectives: ['Third person'],
          coop: { campaign: true, online: true, onlineMax: 4, local: false, splitscreen: false },
          dlcCount: 2,
          expansionCount: 1,
          series: 'Alpha Saga',
        },
      });
      expect(Object.fromEntries(body.fit.map((f) => [f.deviceName, f.status]))).toEqual({
        'Steam Deck': 'green',
        'PlayStation 5': 'hidden',
      });
      expect(body.why).toHaveLength(1);
    });

    it('facts are empty when the game has no critic, reviews or store data', async () => {
      const u = await newUser();
      const body = (await (await get(`/api/games/${C}`, u.cookie)).json()) as {
        facts: { critic: unknown; steamReviews: unknown; stores: unknown[]; links: unknown[] };
      };
      expect(body.facts.critic).toBeNull();
      expect(body.facts.steamReviews).toBeNull();
      expect(body.facts.stores).toEqual([]);
      expect(body.facts.links).toHaveLength(2);
      expect(body.facts).toMatchObject({
        about: { developers: [], modes: [], coop: null, dlcCount: 0, series: null },
      });
    });

    it('batches per-device fit and deck by game id; unknown ids are absent', async () => {
      const u = await newUser();
      await call('POST', '/api/devices', u.cookie, { preset: 'steam-deck' });
      await call('POST', '/api/devices', u.cookie, { preset: 'ps5' });
      const res = await get(`/api/games/fit?ids=${A},${B},${BASE + 9}`, u.cookie);
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        fits: Record<
          string,
          { deck: string | null; fits: { deviceName: string; status: string }[] }
        >;
      };
      expect(Object.keys(body)).toEqual(['fits']);
      expect(Object.keys(body.fits).sort()).toEqual([String(A), String(B)].sort());
      const a = body.fits[String(A)]!;
      expect(Object.keys(a).sort()).toEqual(['deck', 'fits']);
      expect(a.deck).toBe('verified');
      expect(Object.fromEntries(a.fits.map((f) => [f.deviceName, f.status]))).toEqual({
        'Steam Deck': 'green',
        'PlayStation 5': 'hidden',
      });
    });

    it('fit: 400 on bad or too many ids', async () => {
      const u = await newUser();
      expect((await get('/api/games/fit', u.cookie)).status).toBe(400);
      expect((await get('/api/games/fit?ids=abc', u.cookie)).status).toBe(400);
      expect((await get(`/api/games/fit?ids=${A},,${B}`, u.cookie)).status).toBe(400);
      expect((await get('/api/games/fit?ids=0', u.cookie)).status).toBe(400);
      const nine = Array.from({ length: 9 }, (_, i) => BASE + i + 1).join(',');
      expect((await get(`/api/games/fit?ids=${nine}`, u.cookie)).status).toBe(400);
    });

    it('explains nothing when no library game is similar', async () => {
      const u = await newUser();
      await call('POST', '/api/library', u.cookie, {
        igdbId: D,
        hoursPlayed: 30,
        status: 'playing',
      });
      const res = await get(`/api/games/${A}`, u.cookie);
      expect(((await res.json()) as { why: string[] }).why).toEqual([]);
    });

    it('lists more like a game, minus the library, filtered by device', async () => {
      const u = await newUser();
      expect((await call('POST', '/api/devices', u.cookie, { preset: 'ps5' })).status).toBe(201);
      const res = await get(`/api/games/${A}/similar?device=none`, u.cookie);
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        game: { igdbId: number; name: string };
        recommendations: {
          reason: string;
          sourceGame: { igdbId: number } | null;
          game: { igdbId: number };
          fits: unknown[];
        }[];
      };
      expect(body.game).toEqual({ igdbId: A, name: 'Routetest Alpha' });
      const ids = body.recommendations.map((r) => r.game.igdbId);
      expect(ids).toContain(B);
      expect(ids).not.toContain(A);
      const beta = body.recommendations.find((r) => r.game.igdbId === B)!;
      expect(beta.reason).toMatch(/^Like Routetest Alpha/);
      expect(beta.sourceGame?.igdbId).toBe(A);
      expect(beta.fits).toHaveLength(1);

      // Beta is on PS5, so the PS5 filter keeps it.
      const ps5 = (await (await get(`/api/games/${A}/similar?device=ps5`, u.cookie)).json()) as {
        recommendations: { game: { igdbId: number }; fit: { status: string } }[];
      };
      expect(ps5.recommendations.map((r) => r.game.igdbId)).toEqual([B]);
      expect(ps5.recommendations[0]?.fit.status).toBe('green');

      // A library game never comes back.
      await call('POST', '/api/library', u.cookie, {
        igdbId: B,
        hoursPlayed: 30,
        status: 'playing',
      });
      const after = (await (await get(`/api/games/${A}/similar?device=none`, u.cookie)).json()) as {
        recommendations: { game: { igdbId: number } }[];
      };
      expect(after.recommendations.map((r) => r.game.igdbId)).not.toContain(B);
    });

    it('similar: 400 on a bad id, 404 unknown game or device, 401 signed out', async () => {
      const u = await newUser();
      expect((await get('/api/games/abc/similar', u.cookie)).status).toBe(400);
      expect((await get(`/api/games/${BASE + 9}/similar`, u.cookie)).status).toBe(404);
      expect((await get(`/api/games/${A}/similar?device=nope`, u.cookie)).status).toBe(404);
      expect((await get(`/api/games/${A}/similar`)).status).toBe(401);
    });

    it('400 on a bad id, 404 on an unknown game', async () => {
      const u = await newUser();
      expect((await get('/api/games/abc', u.cookie)).status).toBe(400);
      expect((await get('/api/games/0', u.cookie)).status).toBe(400);
      expect((await get(`/api/games/${BASE + 9}`, u.cookie)).status).toBe(404);
    });
  });

  describe('library', () => {
    it('adds, lists, patches and deletes an entry, rebuilding the profile', async () => {
      const u = await newUser();
      const created = await call('POST', '/api/library', u.cookie, {
        igdbId: A,
        platform: 'PC',
        hoursPlayed: 12.5,
        lastPlayed: '2026-11-01',
        status: 'playing',
      });
      expect(created.status).toBe(201);
      const { entry } = (await created.json()) as { entry: Record<string, unknown> };
      expect(entry).toMatchObject({
        igdbId: A,
        name: 'Routetest Alpha',
        platform: 'pc',
        hoursPlayed: 12.5,
        status: 'playing',
        owned: true,
        lastPlayed: '2026-11-01T00:00:00.000Z',
      });
      const [profile] = await ctx.db
        .select()
        .from(schema.tasteProfiles)
        .where(eq(schema.tasteProfiles.userId, u.id));
      expect(profile).toBeDefined();

      await accentsFilled(A);
      const filled = (await (await get('/api/library', u.cookie)).json()) as {
        entries: { id: string; heroUrl: string | null; accent: string | null }[];
      };
      expect(filled.entries.map((e) => e.id)).toEqual([entry.id]);
      expect(filled.entries[0]).toMatchObject({
        heroUrl: 'https://img.test/alpha-hero.jpg',
        accent: '#c81e28',
      });

      const patched = await call('PATCH', `/api/library/${entry.id}`, u.cookie, {
        hoursPlayed: 40,
        status: 'finished',
        lastPlayed: null,
      });
      expect(patched.status).toBe(200);
      expect(((await patched.json()) as { entry: unknown }).entry).toMatchObject({
        hoursPlayed: 40,
        status: 'finished',
        lastPlayed: null,
      });

      expect((await call('DELETE', `/api/library/${entry.id}`, u.cookie)).status).toBe(200);
      const after = (await (await get('/api/library', u.cookie)).json()) as { entries: unknown[] };
      expect(after.entries).toEqual([]);
    });

    it('returns 201 for a new entry and 200 when re-adding updates it', async () => {
      const u = await newUser();
      const first = await call('POST', '/api/library', u.cookie, { igdbId: A, hoursPlayed: 1 });
      expect(first.status).toBe(201);
      const again = await call('POST', '/api/library', u.cookie, { igdbId: A, hoursPlayed: 2 });
      expect(again.status).toBe(200);
      expect(((await again.json()) as { entry: unknown }).entry).toMatchObject({ hoursPlayed: 2 });
    });

    it('400 on invalid input, 404 for an unknown IGDB game', async () => {
      const u = await newUser();
      for (const body of [
        {},
        { igdbId: 'x' },
        { igdbId: A, status: 'bogus' },
        { igdbId: A, hoursPlayed: -1 },
        { igdbId: A, hoursPlayed: '' },
        { igdbId: A, hoursPlayed: true },
        { igdbId: A, lastPlayed: 'yesterday' },
      ]) {
        expect((await call('POST', '/api/library', u.cookie, body)).status).toBe(400);
      }
      expect((await call('POST', '/api/library', u.cookie, { igdbId: BASE + 9 })).status).toBe(404);
      const id = crypto.randomUUID();
      expect((await call('PATCH', `/api/library/${id}`, u.cookie, {})).status).toBe(400);
      expect(
        (await call('PATCH', '/api/library/not-a-uuid', u.cookie, { owned: true })).status,
      ).toBe(400);
      expect((await call('DELETE', '/api/library/not-a-uuid', u.cookie)).status).toBe(400);
    });

    it("never touches another user's entries", async () => {
      const mine = await newUser();
      const theirs = await newUser();
      const res = await call('POST', '/api/library', theirs.cookie, { igdbId: A, hoursPlayed: 5 });
      const { entry } = (await res.json()) as { entry: { id: string } };

      expect(
        ((await (await get('/api/library', mine.cookie)).json()) as { entries: unknown[] }).entries,
      ).toEqual([]);
      expect(
        (await call('PATCH', `/api/library/${entry.id}`, mine.cookie, { hoursPlayed: 99 })).status,
      ).toBe(404);
      expect((await call('DELETE', `/api/library/${entry.id}`, mine.cookie)).status).toBe(404);
      const [row] = await ctx.db
        .select()
        .from(schema.libraryEntries)
        .where(eq(schema.libraryEntries.id, entry.id));
      expect(row?.hoursPlayed).toBe(5);
    });

    it('previews an import without writing, then confirms the chosen games', async () => {
      const u = await newUser();
      const text = [
        '# my list',
        'Routetest Alpha | 10 | 2026-10-01 | finished',
        'Nonexistent Thing',
        'Bad | abc',
      ].join('\n');
      const prev = await call('POST', '/api/library/import', u.cookie, { text });
      expect(prev.status).toBe(200);
      const body = (await prev.json()) as {
        lines: { name: string; match: { igdbId: number } | null; hoursPlayed: number | null }[];
        errors: { line: number }[];
      };
      expect(body.lines).toHaveLength(2);
      expect(body.lines[0]).toMatchObject({
        name: 'Routetest Alpha',
        match: { igdbId: A },
        hoursPlayed: 10,
      });
      expect(body.lines[1]?.match).toBeNull();
      expect(body.errors).toHaveLength(1);
      const none = (await (await get('/api/library', u.cookie)).json()) as { entries: unknown[] };
      expect(none.entries).toEqual([]);

      const confirm = await call('POST', '/api/library/import/confirm', u.cookie, {
        platform: 'pc',
        items: [{ igdbId: A, hoursPlayed: 10, status: 'finished' }, { igdbId: BASE + 9 }],
      });
      expect(confirm.status).toBe(200);
      const done = (await confirm.json()) as {
        imported: { igdbId: number }[];
        failed: { igdbId: number }[];
      };
      expect(done.imported.map((i) => i.igdbId)).toEqual([A]);
      expect(done.failed.map((i) => i.igdbId)).toEqual([BASE + 9]);
      const [row] = await ctx.db
        .select()
        .from(schema.libraryEntries)
        .where(and(eq(schema.libraryEntries.userId, u.id), eq(schema.libraryEntries.igdbId, A)));
      expect(row).toMatchObject({ source: 'import', status: 'finished', hoursPlayed: 10 });
    });

    it('400 on a bad import body', async () => {
      const u = await newUser();
      expect((await call('POST', '/api/library/import', u.cookie, {})).status).toBe(400);
      expect((await call('POST', '/api/library/import', u.cookie, { text: '' })).status).toBe(400);
      const many = Array.from({ length: 101 }, (_, i) => `Game ${i}`).join('\n');
      expect((await call('POST', '/api/library/import', u.cookie, { text: many })).status).toBe(
        400,
      );
      expect(
        (await call('POST', '/api/library/import/confirm', u.cookie, { items: [] })).status,
      ).toBe(400);
      expect(
        (await call('POST', '/api/library/import/confirm', u.cookie, { items: [{ igdbId: 'x' }] }))
          .status,
      ).toBe(400);
    });
  });

  describe('devices', () => {
    it('lists presets and hardware autocomplete without a session', async () => {
      const presets = await get('/api/devices/presets');
      expect(presets.status).toBe(200);
      const body = (await presets.json()) as { presets: { id: string }[] };
      expect(body.presets.map((p) => p.id)).toContain('steam-deck');

      const gpus = await get('/api/hardware/gpus?q=rtx%203060');
      expect(gpus.status).toBe(200);
      const found = (await gpus.json()) as { results: { key: string; score: number }[] };
      expect(found.results.length).toBeGreaterThan(0);
      expect(found.results.every((r) => r.key.includes('3060'))).toBe(true);

      const cpus = await get('/api/hardware/cpus?q=ryzen&limit=3');
      expect(cpus.status).toBe(200);
      expect(((await cpus.json()) as { results: unknown[] }).results.length).toBeLessThanOrEqual(3);
    });

    it('400 on a bad hardware query', async () => {
      expect((await get('/api/hardware/gpus')).status).toBe(400);
      expect((await get('/api/hardware/gpus?q=rtx&limit=0')).status).toBe(400);
      expect((await get('/api/hardware/cpus?q=')).status).toBe(400);
    });

    it('adds a preset and a PC, patches and deletes', async () => {
      const u = await newUser();
      const preset = await call('POST', '/api/devices', u.cookie, {
        preset: 'steam-deck',
        isDefault: true,
      });
      expect(preset.status).toBe(201);
      const pc = await call('POST', '/api/devices', u.cookie, {
        pc: { gpu: 'RTX 3060', cpu: 'Ryzen 5 5600X', ramGb: 16, name: 'Tower' },
      });
      expect(pc.status).toBe(201);
      const { device } = (await pc.json()) as {
        device: { id: string; gpuScore: number; name: string };
      };
      expect(device).toMatchObject({ name: 'Tower' });
      expect(device.gpuScore).toBeGreaterThan(0);

      const patched = await call('PATCH', `/api/devices/${device.id}`, u.cookie, {
        name: 'Big Tower',
        isDefault: true,
        ramGb: 32,
      });
      expect(patched.status).toBe(200);
      expect(((await patched.json()) as { device: unknown }).device).toMatchObject({
        name: 'Big Tower',
        isDefault: true,
        ramGb: 32,
      });
      const list = (await (await get('/api/devices', u.cookie)).json()) as {
        devices: { name: string; isDefault: boolean }[];
      };
      expect(list.devices.filter((d) => d.isDefault).map((d) => d.name)).toEqual(['Big Tower']);

      expect((await call('DELETE', `/api/devices/${device.id}`, u.cookie)).status).toBe(200);
      expect((await call('DELETE', `/api/devices/${device.id}`, u.cookie)).status).toBe(404);
    });

    it('400 on invalid device input', async () => {
      const u = await newUser();
      for (const body of [
        {},
        { preset: 'zx-spectrum' },
        { pc: { gpu: 'Banana 9000', cpu: 'Ryzen 5 5600X', ramGb: 16 } },
        { pc: { gpu: 'RTX 3060', cpu: 'Ryzen 5 5600X', ramGb: -1 } },
        { pc: { gpu: 'RTX 3060' } },
      ]) {
        expect((await call('POST', '/api/devices', u.cookie, body)).status).toBe(400);
      }
      const added = await call('POST', '/api/devices', u.cookie, { preset: 'ps5' });
      const { device } = (await added.json()) as { device: { id: string } };
      expect((await call('PATCH', `/api/devices/${device.id}`, u.cookie, {})).status).toBe(400);
      // consoles have no editable hardware
      expect(
        (await call('PATCH', `/api/devices/${device.id}`, u.cookie, { ramGb: 8 })).status,
      ).toBe(400);
      expect((await call('PATCH', '/api/devices/nope', u.cookie, { name: 'x' })).status).toBe(400);
      expect((await call('DELETE', '/api/devices/nope', u.cookie)).status).toBe(400);
    });

    it("never touches another user's devices", async () => {
      const mine = await newUser();
      const theirs = await newUser();
      const added = await call('POST', '/api/devices', theirs.cookie, { preset: 'ps5' });
      const { device } = (await added.json()) as { device: { id: string } };

      expect(
        ((await (await get('/api/devices', mine.cookie)).json()) as { devices: unknown[] }).devices,
      ).toEqual([]);
      expect(
        (await call('PATCH', `/api/devices/${device.id}`, mine.cookie, { name: 'mine now' }))
          .status,
      ).toBe(404);
      expect((await call('DELETE', `/api/devices/${device.id}`, mine.cookie)).status).toBe(404);
      const [row] = await ctx.db
        .select()
        .from(schema.devices)
        .where(eq(schema.devices.id, device.id));
      expect(row?.name).toBe('PlayStation 5');
    });
  });

  describe('recommendations', () => {
    it('recommends from the library and filters by device', async () => {
      const u = await newUser();
      await call('POST', '/api/library', u.cookie, {
        igdbId: A,
        hoursPlayed: 50,
        status: 'playing',
        lastPlayed: '2026-11-10',
      });
      await call('POST', '/api/devices', u.cookie, { preset: 'ps5' });

      // The first call caches the picks; their accents arrive in the background.
      await get('/api/recommendations?device=none&limit=5', u.cookie);
      await accentsFilled(B);
      const none = await get('/api/recommendations?device=none&limit=5', u.cookie);
      expect(none.status).toBe(200);
      const body = (await none.json()) as {
        recommendations: {
          rank: number;
          reason: string;
          sourceGame: { igdbId: number; name: string } | null;
          game: {
            igdbId: number;
            coverUrl: string | null;
            heroUrl: string | null;
            accent: string | null;
          };
          fit?: unknown;
          fits: { deviceName: string; status: string; reason: string }[];
          deck: string | null;
          timeToBeat: { normallyHours: number } | null;
        }[];
      };
      expect(body.recommendations.map((r) => r.game.igdbId)).toContain(B);
      expect(body.recommendations[0]?.rank).toBe(1);
      expect(body.recommendations[0]?.fit).toBeUndefined();
      // Fits cover every device even with no filtering, and covers come from the games table.
      const beta = body.recommendations.find((r) => r.game.igdbId === B)!;
      expect(beta.fits).toMatchObject([
        { deviceName: 'PlayStation 5', status: 'green', reason: 'Available on this console' },
      ]);
      expect(beta.game).toMatchObject({
        coverUrl: 'https://img.test/beta.jpg',
        coverUrlSmall: 'https://img.test/beta-small.jpg',
        heroUrl: null,
        accent: '#2a6fdb',
      });
      expect(beta.sourceGame).toEqual({ igdbId: A, name: expect.any(String) });
      expect(beta.deck).toBeNull();
      expect(beta.timeToBeat).toBeNull();
      await ctx.db
        .insert(schema.timeToBeat)
        .values({ igdbId: B, normallySeconds: 36_000, count: 10 })
        // The background warm-up may already have cached an empty row for B.
        .onConflictDoUpdate({
          target: schema.timeToBeat.igdbId,
          set: { normallySeconds: 36_000, count: 10, checkedAt: new Date() },
        });

      // Beta is on PS5 (platform 167), so the PS5 filter keeps it with a fit.
      const ps5 = await get('/api/recommendations?device=ps5', u.cookie);
      const filtered = (await ps5.json()) as {
        recommendations: {
          game: { igdbId: number };
          fit: { status: string };
          timeToBeat: unknown;
        }[];
      };
      expect(filtered.recommendations.map((r) => r.game.igdbId)).toEqual([B]);
      expect(filtered.recommendations[0]?.fit.status).toBe('green');
      expect(filtered.recommendations[0]?.timeToBeat).toEqual({
        hastilyHours: null,
        normallyHours: 10,
        completelyHours: null,
        submissions: 10,
      });
      expect((await get('/api/recommendations?device=all', u.cookie)).status).toBe(200);
    });

    it('accepts a limit up to 60', async () => {
      const u = await newUser();
      expect((await get('/api/recommendations?device=none&limit=60', u.cookie)).status).toBe(200);
    });

    it('400 on a bad limit, 404 for a device that is not yours', async () => {
      const mine = await newUser();
      const theirs = await newUser();
      const added = await call('POST', '/api/devices', theirs.cookie, { preset: 'switch' });
      const { device } = (await added.json()) as { device: { id: string } };
      expect((await get('/api/recommendations?limit=0', mine.cookie)).status).toBe(400);
      expect((await get('/api/recommendations?limit=abc', mine.cookie)).status).toBe(400);
      expect((await get('/api/recommendations?limit=61', mine.cookie)).status).toBe(400);
      expect((await get(`/api/recommendations?device=${device.id}`, mine.cookie)).status).toBe(404);
    });
  });

  describe('browse', () => {
    type Browse = {
      recommendations: {
        rank: number;
        game: { igdbId: number; coverUrl: string | null; accent: string | null };
        fit?: { status: string; deviceId: string };
        fits: unknown[];
      }[];
      hasMore: boolean;
    };
    const ids = (b: Browse) => b.recommendations.map((r) => r.game.igdbId);
    const browse = async (path: string, cookie: string) => {
      const res = await get(`/api/browse${path}`, cookie);
      expect(res.status).toBe(200);
      return (await res.json()) as Browse;
    };

    it('lists the IGDB genre and theme facets', async () => {
      const u = await newUser();
      const body = (await (await get('/api/browse/facets', u.cookie)).json()) as {
        genres: { id: number; name: string }[];
        themes: { id: number; name: string }[];
      };
      expect(body.genres).toContainEqual({ id: 12, name: 'Role-playing (RPG)' });
      expect(body.themes).toContainEqual({ id: 17, name: 'Fantasy' });
    });

    it('needs a genre and a theme at once when both are given, same card shape as recommendations', async () => {
      const u = await newUser();
      const either = await browse('?genres=12,31&limit=20', u.cookie);
      expect(ids(either).sort()).toEqual([A, B, C].sort());
      expect(either.hasMore).toBe(false);
      const both = await browse('?genres=12,31&themes=17', u.cookie);
      expect(ids(both)).toEqual([C]);
      const card = both.recommendations[0]!;
      expect(card.rank).toBe(1);
      expect(card).toHaveProperty('fits');
      expect(card.game).toHaveProperty('coverUrl');
      expect(card.game).toHaveProperty('accent');
    });

    it('leaves out owned and disliked games, and pages with offset', async () => {
      const u = await newUser();
      await call('POST', '/api/library', u.cookie, {
        igdbId: A,
        hoursPlayed: 50,
        status: 'playing',
      });
      const open = await browse('?genres=12,31', u.cookie);
      expect(ids(open).sort()).toEqual([B, C].sort());

      const first = await browse('?genres=12,31&limit=1', u.cookie);
      expect(first.hasMore).toBe(true);
      const second = await browse('?genres=12,31&limit=1&offset=1', u.cookie);
      expect(second.hasMore).toBe(false);
      expect(second.recommendations[0]?.rank).toBe(2);
      expect([...ids(first), ...ids(second)].sort()).toEqual([B, C].sort());

      await call('POST', '/api/feedback', u.cookie, { igdbId: B, kind: 'down' });
      expect(ids(await browse('?genres=12,31', u.cookie))).toEqual([C]);
    });

    it('filters to one device or to any of the user devices', async () => {
      const u = await newUser();
      const added = await call('POST', '/api/devices', u.cookie, { preset: 'ps5' });
      const { device } = (await added.json()) as { device: { id: string } };
      // Beta is on PS5 (167); Gamma only on platform 6.
      const one = await browse(`?genres=12,31&deviceId=${device.id}`, u.cookie);
      expect(ids(one)).toEqual([B]);
      expect(one.recommendations[0]?.fit).toMatchObject({ deviceId: device.id });
      const any = await browse('?genres=12,31', u.cookie);
      expect(ids(any)).toEqual([B]);
    });

    it('serves stable pages from one remembered list, and a library change refreshes it', async () => {
      const u = await newUser();
      const before = ids(await browse('?genres=12,31', u.cookie));
      expect(before.sort()).toEqual([A, B, C].sort());
      await call('POST', '/api/library', u.cookie, {
        igdbId: C,
        hoursPlayed: 20,
        status: 'playing',
      });
      expect(ids(await browse('?genres=12,31', u.cookie)).sort()).toEqual([A, B].sort());
    });

    it('asks IGDB once for the same tags', async () => {
      const u = await newUser();
      const before = tagQueries.length;
      await browse('?genres=5,9&themes=1', u.cookie);
      await browse('?genres=9,5&themes=1&limit=5', u.cookie);
      expect(tagQueries.length - before).toBe(1);
    });

    it('400 without tags or with a bad limit, 404 for a device that is not yours', async () => {
      const mine = await newUser();
      const theirs = await newUser();
      const added = await call('POST', '/api/devices', theirs.cookie, { preset: 'switch' });
      const { device } = (await added.json()) as { device: { id: string } };
      expect((await get('/api/browse', mine.cookie)).status).toBe(400);
      expect((await get('/api/browse?genres=abc', mine.cookie)).status).toBe(400);
      expect((await get('/api/browse?genres=12&limit=61', mine.cookie)).status).toBe(400);
      expect((await get('/api/browse?genres=12&limit=0', mine.cookie)).status).toBe(400);
      expect((await get(`/api/browse?genres=12&deviceId=${device.id}`, mine.cookie)).status).toBe(
        404,
      );
    });
  });

  describe('time-to-beat warm-up', () => {
    it('fetches missing time-to-beat for the picks in the background', async () => {
      await ctx.db.delete(schema.timeToBeat).where(inArray(schema.timeToBeat.igdbId, [B]));
      const u = await newUser();
      await call('POST', '/api/library', u.cookie, {
        igdbId: A,
        hoursPlayed: 50,
        status: 'playing',
        lastPlayed: '2026-11-10',
      });
      await get('/api/recommendations?device=none&limit=5', u.cookie);
      await vi.waitFor(async () => {
        const rows = await ctx.db
          .select()
          .from(schema.timeToBeat)
          .where(inArray(schema.timeToBeat.igdbId, [B]));
        expect(rows).toHaveLength(1);
      });
    });

    it('a session waits for the warm-up, so the first response is already cached', async () => {
      await ctx.db.delete(schema.timeToBeat).where(inArray(schema.timeToBeat.igdbId, [B]));
      const u = await newUser();
      await call('POST', '/api/library', u.cookie, {
        igdbId: A,
        hoursPlayed: 50,
        status: 'playing',
        lastPlayed: '2026-11-10',
      });
      expect((await get('/api/session?minutes=30', u.cookie)).status).toBe(200);
      const rows = await ctx.db
        .select()
        .from(schema.timeToBeat)
        .where(inArray(schema.timeToBeat.igdbId, [B]));
      expect(rows).toHaveLength(1);
    });
  });

  describe('session', () => {
    type SessionBody = {
      recommendations: {
        rank: number;
        sessionReason: string;
        game: { igdbId: number };
        timeToBeat: unknown;
      }[];
    };

    it('ranks picks for a session and explains why', async () => {
      const u = await newUser();
      await call('POST', '/api/library', u.cookie, {
        igdbId: A,
        hoursPlayed: 50,
        status: 'playing',
        lastPlayed: '2026-11-10',
      });
      const created = (await (
        await call('POST', '/api/devices', u.cookie, { preset: 'ps5' })
      ).json()) as {
        device: { id: string };
      };
      const device = created.device;
      const res = await get(`/api/session?minutes=40&battery=55&deviceId=${device.id}`, u.cookie);
      expect(res.status).toBe(200);
      const body = (await res.json()) as SessionBody;
      expect(body.recommendations.map((r) => r.game.igdbId)).toContain(B);
      expect(body.recommendations[0]?.rank).toBe(1);
      expect(body.recommendations.every((r) => r.sessionReason.length > 0)).toBe(true);
      expect((await get('/api/session?minutes=40', u.cookie)).status).toBe(200);
    });

    it('400 on bad query, 404 for a device that is not yours, 401 when anonymous', async () => {
      const mine = await newUser();
      expect((await get('/api/session', mine.cookie)).status).toBe(400);
      expect((await get('/api/session?minutes=0', mine.cookie)).status).toBe(400);
      expect((await get('/api/session?minutes=30&battery=101', mine.cookie)).status).toBe(400);
      expect((await get('/api/session?minutes=30&deviceId=nope', mine.cookie)).status).toBe(404);
      // A session needs one concrete device: 'none' and 'all' are not devices.
      expect((await get('/api/session?minutes=30&deviceId=none', mine.cookie)).status).toBe(400);
      expect((await get('/api/session?minutes=30&deviceId=all', mine.cookie)).status).toBe(400);
      expect((await get('/api/session?minutes=30')).status).toBe(401);
    });
  });

  describe('recommendation cache', () => {
    const cacheRows = (userId: string) =>
      ctx.db
        .select()
        .from(schema.recommendationCache)
        .where(eq(schema.recommendationCache.userId, userId));
    type Recs = { recommendations: { game: { igdbId: number } }[] };
    const ids = async (res: Response) =>
      ((await res.json()) as Recs).recommendations.map((r) => r.game.igdbId);
    type U = { cookie: string; id: string };
    const firstEntry = async (u: U) => {
      const [e] = await ctx.db
        .select()
        .from(schema.libraryEntries)
        .where(eq(schema.libraryEntries.userId, u.id));
      return e!;
    };
    const addDevice = async (u: U) => {
      const res = await call('POST', '/api/devices', u.cookie, { preset: 'ps5' });
      return ((await res.json()) as { device: { id: string } }).device.id;
    };

    async function seeded() {
      const u = await newUser();
      await call('POST', '/api/library', u.cookie, {
        igdbId: A,
        hoursPlayed: 5,
        status: 'playing',
      });
      return u;
    }

    it('serves the stored payload on a hit and keeps separate entries per params', async () => {
      const u = await seeded();
      const first = await ids(await get('/api/recommendations?device=none&limit=5', u.cookie));
      expect(first).toContain(B);
      expect(await cacheRows(u.id)).toHaveLength(1);

      // A write that bypasses the API cannot invalidate: only a cache hit still returns B.
      await ctx.db.delete(schema.libraryEntries).where(eq(schema.libraryEntries.userId, u.id));
      const [before] = await cacheRows(u.id);
      await ctx.db
        .update(schema.recommendationCache)
        .set({ computedAt: new Date() })
        .where(eq(schema.recommendationCache.userId, u.id));
      const hit = await get('/api/recommendations?device=none&limit=5', u.cookie);
      expect(await ids(hit)).toEqual(first);
      expect((await cacheRows(u.id))[0]?.payload).toEqual(before?.payload);

      // Different limit / device are different keys, computed from the (now empty) library.
      expect(await ids(await get('/api/recommendations?device=none&limit=6', u.cookie))).toEqual(
        [],
      );
      await get('/api/recommendations?limit=5', u.cookie);
      expect(await cacheRows(u.id)).toHaveLength(3);
    });

    it('treats a missing device and device=all as one entry, but ids stay case-sensitive', async () => {
      const u = await seeded();
      await get('/api/recommendations?limit=5', u.cookie);
      await get('/api/recommendations?device=all&limit=5', u.cookie);
      expect(await cacheRows(u.id)).toHaveLength(1);
    });

    it('stores a payload that survives the JSON round trip', async () => {
      const u = await seeded();
      const live = await (await get('/api/recommendations?device=none', u.cookie)).json();
      const [row] = await cacheRows(u.id);
      expect(row?.payload).toEqual(JSON.parse(JSON.stringify(live)));
    });

    it('serves a stale entry at once and recomputes it in the background', async () => {
      const u = await seeded();
      await get('/api/recommendations?device=none&limit=5', u.cookie);
      await ctx.db.delete(schema.libraryEntries).where(eq(schema.libraryEntries.userId, u.id));
      const old = new Date(Date.now() - 7 * 3600_000);
      await ctx.db
        .update(schema.recommendationCache)
        .set({ computedAt: old })
        .where(eq(schema.recommendationCache.userId, u.id));

      expect(await ids(await get('/api/recommendations?device=none&limit=5', u.cookie))).toContain(
        B,
      );
      await vi.waitFor(async () => {
        const [row] = await cacheRows(u.id);
        expect(row?.computedAt.getTime()).toBeGreaterThan(old.getTime() + 3600_000);
        expect((row?.payload as Recs).recommendations).toEqual([]);
      });
    });

    it('shares one compute between concurrent requests on a miss', async () => {
      const u = await seeded();
      const path = '/api/recommendations?device=none&limit=7';
      const results = await Promise.all([1, 2, 3].map(() => get(path, u.cookie)));
      const bodies = await Promise.all(results.map((r) => r.json()));
      expect(bodies[1]).toEqual(bodies[0]);
      expect(bodies[2]).toEqual(bodies[0]);
      expect(await cacheRows(u.id)).toHaveLength(1);
    });

    const writes: [string, (u: U) => Promise<Response> | Response][] = [
      ['library add', (u) => call('POST', '/api/library', u.cookie, { igdbId: B })],
      [
        'library import confirm',
        (u) => call('POST', '/api/library/import/confirm', u.cookie, { items: [{ igdbId: C }] }),
      ],
      [
        'library update',
        async (u) =>
          call('PATCH', `/api/library/${(await firstEntry(u)).id}`, u.cookie, { hoursPlayed: 9 }),
      ],
      [
        'library delete',
        async (u) => call('DELETE', `/api/library/${(await firstEntry(u)).id}`, u.cookie),
      ],
      [
        'feedback add',
        (u) => call('POST', '/api/feedback', u.cookie, { igdbId: B, kind: 'not_interested' }),
      ],
      [
        'feedback remove',
        async (u) => {
          await call('POST', '/api/feedback', u.cookie, { igdbId: B, kind: 'up' });
          await get('/api/recommendations?device=none', u.cookie);
          return call('DELETE', `/api/feedback/${B}/up`, u.cookie);
        },
      ],
      ['device add', (u) => call('POST', '/api/devices', u.cookie, { preset: 'ps5' })],
      [
        'device update (default change)',
        async (u) => {
          const id = await addDevice(u);
          await get('/api/recommendations?device=none', u.cookie);
          return call('PATCH', `/api/devices/${id}`, u.cookie, { isDefault: true });
        },
      ],
      [
        'device delete',
        async (u) => {
          const id = await addDevice(u);
          await get('/api/recommendations?device=none', u.cookie);
          return call('DELETE', `/api/devices/${id}`, u.cookie);
        },
      ],
    ];
    const version = async (u: U) =>
      (await ctx.db.select().from(schema.users).where(eq(schema.users.id, u.id)))[0]!.recsVersion;

    it.each(writes)(
      '%s bumps the version, so the next request recomputes',
      async (_name, write) => {
        const u = await seeded();
        await get('/api/recommendations?device=none', u.cookie);
        await get('/api/recommendations?limit=3', u.cookie);
        const before = await version(u);
        expect((await cacheRows(u.id)).every((r) => r.version === before)).toBe(true);
        const res = await write(u);
        expect(res.status).toBeLessThan(300);
        const after = await version(u);
        expect(after).toBeGreaterThan(before);
        await get('/api/recommendations?device=none', u.cookie);
        const rows = await cacheRows(u.id);
        expect(rows.find((r) => r.key.includes('device=none'))?.version).toBe(after);
      },
    );

    it('recomputes after a CLI-style write through core, with no HTTP involved', async () => {
      const u = await seeded();
      const first = await ids(await get('/api/recommendations?device=none&limit=5', u.cookie));
      expect(first).toContain(B);
      expect(await deleteLibraryEntry(ctx.db, u.id, (await firstEntry(u)).id)).toBe(true);
      expect(await ids(await get('/api/recommendations?device=none&limit=5', u.cookie))).toEqual(
        [],
      );
    });

    it('does not bump the version for failed writes, the import preview or a profile rebuild', async () => {
      const u = await seeded();
      const before = await version(u);
      const entry = await firstEntry(u);
      const results = await Promise.all([
        call('POST', '/api/library', u.cookie, { igdbId: BASE + 9 }), // unknown game: 404
        call('POST', '/api/library', u.cookie, { igdbId: 'x' }), // bad body: 400
        call('PATCH', `/api/library/${crypto.randomUUID()}`, u.cookie, { hoursPlayed: 1 }),
        call('DELETE', `/api/library/${crypto.randomUUID()}`, u.cookie),
        call('PATCH', `/api/devices/${crypto.randomUUID()}`, u.cookie, { name: 'x' }),
        call('DELETE', `/api/feedback/${B}/up`, u.cookie), // nothing to remove
        call('POST', '/api/library/import', u.cookie, { text: 'Routetest Alpha' }),
        call('POST', '/api/profile/rebuild', u.cookie),
        call('PATCH', `/api/library/${entry.id}`, u.cookie, {}), // empty patch: 400
      ]);
      expect(results.map((r) => r.status)).toEqual([404, 400, 404, 404, 404, 200, 200, 200, 400]);
      expect(await version(u)).toBe(before);
    });

    it("never touches another user's version", async () => {
      const mine = await seeded();
      const theirs = await seeded();
      const before = await version(theirs);
      await call('POST', '/api/devices', mine.cookie, { preset: 'ps5' });
      expect(await version(theirs)).toBe(before);
    });

    it('does not let a slow compute overwrite a row from a newer version', async () => {
      const u = await seeded();
      const key = 'device=none;limit=11';
      const payload = (name: string) =>
        ({ recommendations: [], marker: name }) as unknown as RecommendationsResponse;
      let release!: () => void;
      const slow = cachedRecommendations(ctx.db, u.id, key, async () => {
        await new Promise<void>((r) => (release = r));
        return payload('old');
      });
      await vi.waitFor(() => expect(release).toBeTypeOf('function'));
      await call('POST', '/api/devices', u.cookie, { preset: 'ps5' }); // newer version
      const fresh = await cachedRecommendations(ctx.db, u.id, key, async () => payload('new'));
      expect(fresh).toEqual(payload('new'));
      release();
      await slow;
      const [row] = (await cacheRows(u.id)).filter((r) => r.key === key);
      expect(row?.payload).toEqual(payload('new'));
      expect(row?.version).toBe(await version(u));
    });
  });

  describe('feedback and profile', () => {
    const kinds = async (userId: string, igdbId: number) =>
      (
        await ctx.db
          .select({ kind: schema.feedback.kind })
          .from(schema.feedback)
          .where(and(eq(schema.feedback.userId, userId), eq(schema.feedback.igdbId, igdbId)))
      )
        .map((f) => f.kind)
        .sort();

    it('upserts: up and down replace each other, flags stack once', async () => {
      const u = await newUser();
      const send = (kind: string) => call('POST', '/api/feedback', u.cookie, { igdbId: C, kind });
      expect((await send('up')).status).toBe(200);
      expect((await send('up')).status).toBe(200);
      expect(await kinds(u.id, C)).toEqual(['up']);
      expect((await send('down')).status).toBe(200);
      expect(await kinds(u.id, C)).toEqual(['down']);
      await send('played');
      await send('played');
      await send('not_interested');
      expect(await kinds(u.id, C)).toEqual(['down', 'not_interested', 'played']);
      const [profile] = await ctx.db
        .select()
        .from(schema.tasteProfiles)
        .where(eq(schema.tasteProfiles.userId, u.id));
      expect(profile).toBeDefined();
    });

    it('lists current feedback and undoes one kind with DELETE', async () => {
      const u = await newUser();
      const send = (kind: string) => call('POST', '/api/feedback', u.cookie, { igdbId: C, kind });
      const list = async () =>
        ((await (await get('/api/feedback', u.cookie)).json()) as { feedback: object }).feedback;
      expect(await list()).toEqual({});
      await send('up');
      expect(await list()).toEqual({ [C]: 'up' });
      await send('not_interested');
      expect(await list()).toEqual({ [C]: 'not_interested' });
      expect((await call('DELETE', `/api/feedback/${C}/not_interested`, u.cookie)).status).toBe(
        200,
      );
      expect(await list()).toEqual({ [C]: 'up' });
      await call('DELETE', `/api/feedback/${C}/up`, u.cookie);
      expect(await list()).toEqual({});
      expect((await call('DELETE', `/api/feedback/${C}/meh`, u.cookie)).status).toBe(400);
      expect((await call('DELETE', `/api/feedback/0/up`, u.cookie)).status).toBe(400);
    });

    it('400 on bad input, 404 for an unknown game', async () => {
      const u = await newUser();
      for (const body of [
        {},
        { igdbId: C },
        { igdbId: C, kind: 'meh' },
        { igdbId: 'x', kind: 'up' },
        { igdbId: -1, kind: 'up' },
      ]) {
        expect((await call('POST', '/api/feedback', u.cookie, body)).status).toBe(400);
      }
      expect(
        (await call('POST', '/api/feedback', u.cookie, { igdbId: BASE + 9, kind: 'up' })).status,
      ).toBe(404);
    });

    it('rebuilds the taste profile on demand', async () => {
      const u = await newUser();
      const res = await call('POST', '/api/profile/rebuild', u.cookie);
      expect(res.status).toBe(200);
      expect(((await res.json()) as { ok: boolean }).ok).toBe(true);
      const rows = await ctx.db
        .select()
        .from(schema.tasteProfiles)
        .where(eq(schema.tasteProfiles.userId, u.id));
      expect(rows).toHaveLength(1);
    });
  });
});
