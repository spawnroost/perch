import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDb, runMigrations, schema, type Db } from '@perch/db';
import { createVerifiedUser } from '../../src/index.js';

const url = process.env.DATABASE_URL_TEST;

describe.skipIf(!url)('createVerifiedUser', () => {
  let db: Db;
  const email = `verified-${crypto.randomUUID()}@test.dev`;
  beforeAll(async () => {
    await runMigrations(url!);
    db = createDb(url!);
  });
  afterAll(async () => {
    await db.delete(schema.users).where(eq(schema.users.email, email));
    await db.$client.end({ timeout: 1 });
  });

  it('creates a verified user with a credential account, and updates the password when re-run', async () => {
    const hash = async (p: string) => `hashed:${p}`;
    const first = await createVerifiedUser(db, { email, password: 'pw-one-12345' }, hash);
    expect(first.created).toBe(true);
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, first.id));
    expect(user).toMatchObject({ email, emailVerified: true, name: email.split('@')[0] });
    const [acc] = await db
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.userId, first.id));
    expect(acc).toMatchObject({
      providerId: 'credential',
      accountId: first.id,
      password: 'hashed:pw-one-12345',
    });

    const second = await createVerifiedUser(db, { email, password: 'pw-two-12345' }, hash);
    expect(second).toEqual({ id: first.id, created: false });
    const accs = await db
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.userId, first.id));
    expect(accs).toHaveLength(1);
    expect(accs[0]?.password).toBe('hashed:pw-two-12345');
  });
});
