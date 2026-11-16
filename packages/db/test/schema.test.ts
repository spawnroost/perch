import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDb, runMigrations, schema, type Db } from '../src/index.js';

const url = process.env.DATABASE_URL_TEST;
if (!url) {
  console.warn('[skip] DATABASE_URL_TEST is not set; DB tests skipped (see .env.example)');
}

describe.skipIf(!url)('db schema', () => {
  let db: Db;
  beforeAll(async () => {
    await runMigrations(url!);
    db = createDb(url!);
  });
  afterAll(async () => {
    await db?.$client.end({ timeout: 1 });
  });

  it('inserts and reads a user + library row, and cascades on user delete', async () => {
    const userId = `test-${crypto.randomUUID()}`;
    const igdbId = 1_000_000 + Math.floor(Math.random() * 1_000_000);
    await db.insert(schema.users).values({ id: userId, name: 'T', email: `${userId}@test.dev` });
    await db.insert(schema.games).values({ igdbId, name: 'Hades', slug: 'hades' });
    await db.insert(schema.libraryEntries).values({ userId, igdbId, platform: 'pc' });

    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
    expect(user?.plan).toBe('free');
    const rows = await db
      .select()
      .from(schema.libraryEntries)
      .where(eq(schema.libraryEntries.userId, userId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ igdbId, platform: 'pc', status: 'backlog', owned: true });

    await db.delete(schema.users).where(eq(schema.users.id, userId));
    const after = await db
      .select()
      .from(schema.libraryEntries)
      .where(eq(schema.libraryEntries.userId, userId));
    expect(after).toHaveLength(0);
    await db.delete(schema.games).where(eq(schema.games.igdbId, igdbId));
  });
});
