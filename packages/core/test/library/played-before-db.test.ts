import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import { createDb, games, libraryEntries, runMigrations, users, type Db } from '@perch/db';
import {
  buildGameRow,
  dismissPlayedBefore,
  listPlayedBefore,
  setLibraryStatus,
  updateLibraryEntry,
  type Game,
} from '../../src/index.js';

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

  it('dismiss clears the flag but leaves status alone, and only for own entries', async () => {
    const a = await idOf(IDS[0]!);
    const theirs = await idOf(IDS[0]!, OTHER);
    expect(await dismissPlayedBefore(db, USER, [a, theirs])).toEqual({ updated: 1 });
    expect((await listPlayedBefore(db, USER)).map((e) => e.entryId)).not.toContain(a);
    expect((await rows()).find((r) => r.id === a)!.status).toBe('backlog');
    expect(await listPlayedBefore(db, OTHER)).toHaveLength(1);
    expect(await dismissPlayedBefore(db, USER, [])).toEqual({ updated: 0 });
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
