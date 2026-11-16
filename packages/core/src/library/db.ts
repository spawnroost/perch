import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { accounts, games, libraryEntries, sessions, users, type Db } from '@perch/db';
import type { IgdbCache } from '../igdb/cache.js';
import type { IgdbClient } from '../igdb/client.js';
import type { Game } from '../igdb/schemas.js';
import type { AddArgs } from './args.js';
import { pickBestMatch, type Suggestion } from './match.js';
import type { ImportEntry } from './parse.js';
import { buildGameRow, buildLibraryRow } from './rows.js';

export class UserExistsError extends Error {
  constructor(email: string) {
    super(`user ${email} already exists (pass --reset-password to reset their password)`);
    this.name = 'UserExistsError';
  }
}

/**
 * Creates (or updates) an email-verified user with a password login. `hash` is injected so core
 * does not depend on the auth library; it must produce better-auth's password hash format.
 * An existing user is only touched with `resetPassword`, which also signs them out everywhere.
 */
export async function createVerifiedUser(
  db: Db,
  { email, password, name }: { email: string; password: string; name?: string },
  hash: (password: string) => Promise<string>,
  { resetPassword = false }: { resetPassword?: boolean } = {},
): Promise<{ id: string; created: boolean }> {
  const passwordHash = await hash(password);
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(users)
      .values({ id: randomUUID(), email, name: name ?? email.split('@')[0]!, emailVerified: true })
      .onConflictDoNothing({ target: users.email })
      .returning({ id: users.id });
    const created = Boolean(inserted[0]);
    if (!created && !resetPassword) throw new UserExistsError(email);
    const id = inserted[0]?.id ?? (await findUserId(tx as unknown as Db, email));
    if (!created) {
      await tx.update(users).set({ emailVerified: true }).where(eq(users.id, id));
      await tx.delete(sessions).where(eq(sessions.userId, id));
    }
    await tx
      .insert(accounts)
      .values({
        id: randomUUID(),
        accountId: id,
        providerId: 'credential',
        userId: id,
        password: passwordHash,
      })
      .onConflictDoUpdate({
        target: [accounts.userId, accounts.providerId],
        set: { password: passwordHash },
      });
    return { id, created };
  });
}

export async function findUserId(db: Db, email: string): Promise<string> {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (!row) throw new Error(`no user ${email} (run: perch user:create ${email})`);
  return row.id;
}

export interface AddedGame {
  igdbId: number;
  name: string;
}

/** No exact IGDB name match; carries the closest candidates so the caller can suggest `--igdb`. */
export class NoMatchError extends Error {
  constructor(
    readonly query: string,
    readonly suggestions: Suggestion[],
  ) {
    const close = suggestions
      .map((s) => `${s.name} (${s.year ?? '?'}, igdb ${s.igdbId})`)
      .join('; ');
    super(
      `no exact IGDB match for "${query}"` +
        (close ? `; closest: ${close}; retry with --igdb <id>` : ''),
    );
    this.name = 'NoMatchError';
  }
}

export interface AddGameDeps {
  db: Db;
  client: IgdbClient;
  /** Build once per command and reuse across games. */
  cache: IgdbCache;
  /** Taste-vocab mapper, injected so core does not depend on taste-vocab. */
  mapVocab: (game: Game) => Record<string, number>;
}

/** Resolves the game on IGDB (search or --igdb), then upserts the game and library entry atomically. */
export async function addGame(
  deps: AddGameDeps,
  userId: string,
  args: Omit<AddArgs, 'name'> & ImportEntry,
  source: 'manual' | 'import',
): Promise<AddedGame> {
  const { db, client, cache, mapVocab } = deps;
  let igdbId = args.igdb;
  if (igdbId === undefined) {
    const { candidates } = await client.searchGames(args.name);
    const { match, suggestions } = pickBestMatch(args.name, candidates);
    if (!match) throw new NoMatchError(args.name, suggestions);
    igdbId = match.igdbId;
  }
  const game = await cache.getGame(igdbId);
  if (!game) throw new Error(`IGDB has no game with id ${igdbId}`);

  const row = buildGameRow(game, mapVocab(game));
  const { insert, update } = buildLibraryRow({
    userId,
    igdbId,
    platform: args.platform,
    source,
    hours: args.hours,
    lastPlayed: args.lastPlayed,
    status: args.status,
    owned: args.owned,
  });
  await db.transaction(async (tx) => {
    await tx.insert(games).values(row).onConflictDoUpdate({ target: games.igdbId, set: row });
    const q = tx.insert(libraryEntries).values(insert);
    if (Object.keys(update).length === 0) {
      await q.onConflictDoNothing({
        target: [libraryEntries.userId, libraryEntries.igdbId, libraryEntries.platform],
      });
    } else {
      await q.onConflictDoUpdate({
        target: [libraryEntries.userId, libraryEntries.igdbId, libraryEntries.platform],
        set: update,
      });
    }
  });
  return { igdbId, name: game.name };
}
