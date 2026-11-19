import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { createDb, games, libraryEntries, runMigrations, users, type Db } from '@perch/db';
import {
  buildGameRow,
  listPlayedBefore,
  resolvePlayedBefore,
  setLibraryStatus,
  updateLibraryEntry,
  type Game,
} from '../../src/index.js';
import { upsertImportedEntries } from '../../src/library/bulk.js';

const url = process.env.DATABASE_URL_TEST;
if (!url) console.warn('[skip] DATABASE_URL_TEST is not set; played-before tests skipped');

const USER = 'played-before-test-user';
const OTHER = 'played-before-test-other';
const IDS = [987659001, 987659002, 987659003];

const game = (igdbId: number) =>
  buildGameRow(
    {
      igdbId,
      name: `Pb ${igdbId}`,
      slug: `pb-${igdbId}`,
      genres: [],
      themes: [],
      keywords: [],
      perspectives: [],
      gameModes: [],
      platforms: [6],
      similarIds: [],
      series: [],
      websites: [],
    } as unknown as Game,
    {},
  );

describe.skipIf(!url)('played-before flag', () => {
  let db: Db;
  const entry = (userId: string, igdbId: number, hoursPlayed: number | null, pending = true) => ({
    userId,
    igdbId,
    platform: 'pc',
    hoursPlayed,
    lastPlayed: new Date('2020-01-01T00:00:00Z'),
    playedBeforePending: pending,
  });
  const rows = (userId = USER) =>
    db.select().from(libraryEntries).where(eq(libraryEntries.userId, userId));
  const idOf = async (igdbId: number, userId = USER) =>
    (await rows(userId)).find((r) => r.igdbId === igdbId)!.id;

  beforeAll(async () => {
    await runMigrations(url!);
    db = createDb(url!);
    await db
      .insert(users)
      .values([
        { id: USER, name: 'x', email: 'pb@test.dev' },
        { id: OTHER, name: 'y', email: 'pb2@test.dev' },
      ])
      .onConflictDoNothing();
    await db.insert(games).values(IDS.map(game)).onConflictDoNothing();
  });
  beforeEach(async () => {
    await db.delete(libraryEntries).where(inArray(libraryEntries.userId, [USER, OTHER]));
    await db
      .insert(libraryEntries)
      .values([
        entry(USER, IDS[0]!, 10),
        entry(USER, IDS[1]!, 100),
        entry(USER, IDS[2]!, null),
        entry(OTHER, IDS[0]!, 50),
      ]);
  });
  afterAll(async () => {
    await db.delete(users).where(inArray(users.id, [USER, OTHER]));
    await db.delete(games).where(inArray(games.igdbId, IDS));
    await db.$client.end({ timeout: 1 });
  });

  it('lists only the user pending entries, most played first, hours as minutes', async () => {
    expect(await listPlayedBefore(db, USER)).toEqual([
      {
        entryId: await idOf(IDS[1]!),
        title: `Pb ${IDS[1]}`,
        minutes: 6000,
        lastPlayed: '2020-01-01T00:00:00.000Z',
      },
      {
        entryId: await idOf(IDS[0]!),
        title: `Pb ${IDS[0]}`,
        minutes: 600,
        lastPlayed: '2020-01-01T00:00:00.000Z',
      },
      {
        entryId: await idOf(IDS[2]!),
        title: `Pb ${IDS[2]}`,
        minutes: null,
        lastPlayed: '2020-01-01T00:00:00.000Z',
      },
    ]);
  });

  it('resolve pauses some, keeps others, in one go, for own entries only', async () => {
    const [a, b, c] = [await idOf(IDS[0]!), await idOf(IDS[1]!), await idOf(IDS[2]!)];
    const theirs = await idOf(IDS[0]!, OTHER);
    const res = await resolvePlayedBefore(db, USER, { pausedIds: [a, theirs], keptIds: [b] });
    expect(res).toEqual({ paused: 1, kept: 1 });
    const byId = new Map((await rows()).map((r) => [r.id, r]));
    expect(byId.get(a)).toMatchObject({ status: 'paused', playedBeforePending: false });
    // Kept: still backlog, just no longer asked about.
    expect(byId.get(b)).toMatchObject({ status: 'backlog', playedBeforePending: false });
    expect((await listPlayedBefore(db, USER)).map((e) => e.entryId)).toEqual([c]);
    expect(await listPlayedBefore(db, OTHER)).toHaveLength(1);
    expect(await resolvePlayedBefore(db, USER, { pausedIds: [], keptIds: [] })).toEqual({
      paused: 0,
      kept: 0,
    });
  });

  it('does not list entries that are no longer backlog or were played in the last 30 days', async () => {
    const [a, b] = [await idOf(IDS[0]!), await idOf(IDS[1]!)];
    await db.update(libraryEntries).set({ status: 'playing' }).where(eq(libraryEntries.id, a));
    await db.update(libraryEntries).set({ lastPlayed: new Date() }).where(eq(libraryEntries.id, b));
    expect((await listPlayedBefore(db, USER)).map((e) => e.entryId)).toEqual([await idOf(IDS[2]!)]);
  });

  it('a re-import that finds a recent last-played clears the flag; an old one keeps it', async () => {
    const [a, b] = [await idOf(IDS[0]!), await idOf(IDS[1]!)];
    const row = (igdbId: number, lastPlayed: Date) => ({
      userId: USER,
      igdbId,
      platform: 'pc',
      lastPlayed,
    });
    await upsertImportedEntries(db, [
      row(IDS[0]!, new Date()),
      row(IDS[1]!, new Date('2020-06-01T00:00:00Z')),
    ]);
    const byId = new Map((await rows()).map((r) => [r.id, r]));
    expect(byId.get(a)!.playedBeforePending).toBe(false);
    expect(byId.get(b)!.playedBeforePending).toBe(true);
  });

  it('the backfill migration flags old Steam/file backlog entries with an hour or more', async () => {
    const insertEntry = (igdbId: number, over: Partial<typeof libraryEntries.$inferInsert>) => ({
      userId: OTHER,
      igdbId,
      platform: 'pc',
      ...over,
    });
    await db.delete(libraryEntries).where(eq(libraryEntries.userId, OTHER));
    await db.insert(libraryEntries).values([
      insertEntry(IDS[0]!, {
        source: 'steam',
        hoursPlayed: 5,
        lastPlayed: new Date('2020-01-01'),
      }),
      insertEntry(IDS[1]!, { source: 'import', hoursPlayed: 5, lastPlayed: null }),
      insertEntry(IDS[2]!, { source: 'steam', hoursPlayed: 0.5 }),
      insertEntry(IDS[2]!, { platform: 'xbox', source: 'xbox', hoursPlayed: 5 }),
      insertEntry(IDS[0]!, {
        platform: 'epic',
        source: 'steam',
        hoursPlayed: 5,
        lastPlayed: new Date(),
      }),
      insertEntry(IDS[1]!, {
        platform: 'gog',
        source: 'steam',
        hoursPlayed: 5,
        status: 'finished',
      }),
    ]);
    const sqlText = readFileSync(
      fileURLToPath(
        new URL('../../../db/drizzle/0018_backfill_played_before.sql', import.meta.url),
      ),
      'utf8',
    );
    await db.execute(sql.raw(sqlText));
    const flagged = (await rows(OTHER))
      .filter((r) => r.playedBeforePending)
      .map((r) => `${r.igdbId}:${r.platform}`)
      .sort();
    expect(flagged).toEqual([`${IDS[0]}:pc`, `${IDS[1]}:pc`]);
  });

  it('a bulk status change clears the flag of the entries it touches', async () => {
    const a = await idOf(IDS[0]!);
    expect(await setLibraryStatus(db, USER, [a], 'paused')).toEqual({ updated: 1 });
    const left = (await listPlayedBefore(db, USER)).map((e) => e.entryId);
    expect(left).not.toContain(a);
    expect(left).toHaveLength(2);
    expect((await rows()).find((r) => r.id === a)!.status).toBe('paused');
  });

  it('a manual status edit clears the flag, other edits do not', async () => {
    const a = await idOf(IDS[0]!);
    await updateLibraryEntry(db, USER, a, { hoursPlayed: 12 });
    expect(await listPlayedBefore(db, USER)).toHaveLength(3);
    await updateLibraryEntry(db, USER, a, { status: 'finished' });
    const pending = await db
      .select({ id: libraryEntries.id })
      .from(libraryEntries)
      .where(and(eq(libraryEntries.userId, USER), eq(libraryEntries.playedBeforePending, true)));
    expect(pending.map((p) => p.id)).not.toContain(a);
    expect(pending).toHaveLength(2);
  });
});
