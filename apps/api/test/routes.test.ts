import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import { hashPassword } from 'better-auth/crypto';
import { createVerifiedUser, type DeckCategory, type Game, type IgdbClient } from '@perch/core';
import { schema } from '@perch/db';
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
    ...extra,
  };
}

const catalog = [
  game(A, 'Routetest Alpha', {
    similarIds: [B],
    steamAppId: 4_000_001,
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
  game(C, 'Routetest Gamma', { genres: [31] }),
  game(D, 'Routetest Delta', { genres: [5] }),
];

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
  async queryByTags() {
    return [];
  },
  async getTimeToBeat(id) {
    return id === A
      ? { hastilySeconds: 3600, normallySeconds: 7200, completelySeconds: null, count: 50 }
      : null;
  },
  async keywordNames() {
    return {};
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
      });
      expect(Object.fromEntries(body.fit.map((f) => [f.deviceName, f.reason]))).toEqual({
        'Steam Deck': 'Steam Deck Verified',
        'PlayStation 5': 'Not released on this device',
      });
      expect(body.deck).toBe('verified');
      expect(Object.fromEntries(body.fit.map((f) => [f.deviceName, f.status]))).toEqual({
        'Steam Deck': 'green',
        'PlayStation 5': 'hidden',
      });
      expect(body.why).toHaveLength(1);
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
