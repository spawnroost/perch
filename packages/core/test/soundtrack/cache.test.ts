import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDb, gameSoundtracks, games, runMigrations, type Db } from '@perch/db';
import {
  createItunesClient,
  getSharedItunesClient,
  soundtrackFor,
  soundtrackIdle,
  SOUNDTRACK_TTL_MS,
  type ItunesClient,
  type Soundtrack,
} from '../../src/soundtrack/index.js';

const searchBody = {
  results: [
    {
      collectionId: 7,
      collectionName: 'Celeste (Original Soundtrack)',
      artistName: 'Lena Raine',
      collectionType: 'Album',
      trackCount: 30,
      artworkUrl100: 'https://x/100x100bb.jpg',
      collectionViewUrl: 'https://music.apple.com/us/album/celeste/7',
    },
    {
      collectionId: 8,
      collectionName: 'Celeste Piano Tribute Soundtrack',
      artistName: 'Someone',
      collectionType: 'Album',
      trackCount: 90,
    },
  ],
};
const lookupBody = {
  results: [
    { wrapperType: 'collection' },
    {
      wrapperType: 'track',
      trackName: 'Prologue',
      trackNumber: 1,
      trackTimeMillis: 5,
      previewUrl: 'https://p/1.m4a',
    },
  ],
};

describe('createItunesClient', () => {
  function stub(search: unknown, lookup: unknown, status = 200) {
    const urls: string[] = [];
    const fetchFn = (async (u: string) => {
      urls.push(String(u));
      const body = String(u).includes('/lookup?') ? lookup : search;
      return new Response(JSON.stringify(body), { status });
    }) as unknown as typeof fetch;
    return { urls, client: createItunesClient({ fetch: fetchFn, sleep: async () => {} }) };
  }

  it('searches albums, then looks up the matched album songs', async () => {
    const s = stub(searchBody, lookupBody);
    const found = await s.client.findSoundtrack('Celeste');
    expect(found).toMatchObject({
      albumName: 'Celeste (Original Soundtrack)',
      artist: 'Lena Raine',
      artworkUrl: 'https://x/600x600bb.jpg',
    });
    expect(found!.tracks).toEqual([
      { name: 'Prologue', number: 1, durationMs: 5, previewUrl: 'https://p/1.m4a' },
    ]);
    const search = new URL(s.urls[0]!);
    expect(search.origin + search.pathname).toBe('https://itunes.apple.com/search');
    expect(search.searchParams.get('term')).toBe('Celeste soundtrack');
    expect(search.searchParams.get('entity')).toBe('album');
    expect(search.searchParams.get('limit')).toBe('10');
    const lookup = new URL(s.urls[1]!);
    expect(lookup.searchParams.get('id')).toBe('7');
    expect(lookup.searchParams.get('entity')).toBe('song');
  });

  it('is null without a second request when nothing matches', async () => {
    const s = stub({ results: [] }, lookupBody);
    expect(await s.client.findSoundtrack('Celeste')).toBeNull();
    expect(s.urls).toHaveLength(1);
  });

  it('throws on an HTTP error so the cache can back off', async () => {
    const s = stub({}, {}, 503);
    await expect(s.client.findSoundtrack('Celeste')).rejects.toThrow(/503/);
  });

  it('shares one client per process', () => {
    expect(getSharedItunesClient()).toBe(getSharedItunesClient());
  });
});

const url = process.env.DATABASE_URL_TEST;
if (!url) console.warn('[skip] DATABASE_URL_TEST is not set; soundtrack cache tests skipped');

const ID = 987_654_322;
const T0 = new Date('2026-06-01T00:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const album: Soundtrack = {
  albumName: 'Celeste OST',
  artist: 'Lena Raine',
  artworkUrl: null,
  appleMusicUrl: 'https://music.apple.com/x',
  tracks: [{ name: 'A', number: 1, durationMs: 1, previewUrl: null }],
};

describe.skipIf(!url)('soundtrackFor', () => {
  let db: Db;
  beforeAll(async () => {
    await runMigrations(url!);
    db = createDb(url!);
  });
  afterAll(async () => {
    await db.delete(games).where(eq(games.igdbId, ID));
    await db?.$client.end({ timeout: 1 });
  });
  beforeEach(async () => {
    await db.delete(games).where(eq(games.igdbId, ID));
    await db.insert(games).values({ igdbId: ID, name: 'Celeste', slug: 'soundtrack-test' });
  });

  function fake(result: () => Promise<Soundtrack | null>) {
    const calls: string[] = [];
    const client: ItunesClient = {
      async findSoundtrack(name) {
        calls.push(name);
        return result();
      },
    };
    return { client, calls };
  }
  const game = { igdbId: ID, name: 'Celeste' };

  it('fetches, stores and returns the album; a fresh row is not refetched', async () => {
    const f = fake(async () => album);
    const opts = { client: f.client, now: () => T0 };
    expect(await soundtrackFor(db, game, opts)).toEqual(album);
    expect(await soundtrackFor(db, game, { ...opts, now: () => new Date(+T0 + 6 * DAY) })).toEqual(
      album,
    );
    expect(f.calls).toEqual(['Celeste']);
  });

  it('shares one lookup between overlapping requests', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const f = fake(async () => {
      await gate;
      return album;
    });
    const opts = { client: f.client, now: () => T0 };
    const both = Promise.all([soundtrackFor(db, game, opts), soundtrackFor(db, game, opts)]);
    release();
    expect(await both).toEqual([album, album]);
    expect(f.calls).toHaveLength(1);
  });

  it('negative-caches "no match" for 7 days, then asks again', async () => {
    const f = fake(async () => null);
    const at = (ms: number) => ({ client: f.client, now: () => new Date(+T0 + ms) });
    expect(await soundtrackFor(db, game, at(0))).toBeNull();
    expect(await soundtrackFor(db, game, at(6 * DAY))).toBeNull();
    expect(f.calls).toHaveLength(1);
    await soundtrackFor(db, game, at(SOUNDTRACK_TTL_MS + 1000));
    await soundtrackIdle();
    expect(f.calls).toHaveLength(2);
  });

  it('serves a stale album at once and refreshes it in the background', async () => {
    await soundtrackFor(db, game, { client: fake(async () => album).client, now: () => T0 });
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const newer = { ...album, albumName: 'Celeste OST (Deluxe)' };
    const slow = fake(async () => {
      await gate;
      return newer;
    });
    const later = { client: slow.client, now: () => new Date(+T0 + 9 * DAY), waitMs: 60_000 };
    expect(await soundtrackFor(db, game, later)).toEqual(album);
    release();
    await soundtrackIdle();
    const [row] = await db.select().from(gameSoundtracks).where(eq(gameSoundtracks.igdbId, ID));
    expect(row?.payload).toEqual(newer);
  });

  it('keeps the stale album when a refetch fails, and retries only after 6 hours', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await soundtrackFor(db, game, { client: fake(async () => album).client, now: () => T0 });
    const bad = fake(async () => {
      throw new Error('boom');
    });
    const at = (ms: number) => ({ client: bad.client, now: () => new Date(+T0 + ms) });
    expect(await soundtrackFor(db, game, at(9 * DAY))).toEqual(album);
    await soundtrackIdle();
    expect(await soundtrackFor(db, game, at(9 * DAY + 60 * 60 * 1000))).toEqual(album);
    expect(bad.calls).toHaveLength(1);
    await soundtrackFor(db, game, at(9 * DAY + 7 * 60 * 60 * 1000));
    await soundtrackIdle();
    expect(bad.calls).toHaveLength(2);
    warn.mockRestore();
  });

  it('negative-caches a first-time failure and returns null', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bad = fake(async () => {
      throw new Error('boom');
    });
    const at = (ms: number) => ({ client: bad.client, now: () => new Date(+T0 + ms) });
    expect(await soundtrackFor(db, game, at(0))).toBeNull();
    await soundtrackFor(db, game, at(60 * 60 * 1000));
    expect(bad.calls).toHaveLength(1);
    warn.mockRestore();
  });

  it('never throws: a database error gives null', async () => {
    const broken = {
      select() {
        throw new Error('db down');
      },
    } as unknown as Db;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(
      await soundtrackFor(broken, game, { client: fake(async () => album).client }),
    ).toBeNull();
    warn.mockRestore();
  });
});
