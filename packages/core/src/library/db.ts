import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { games, libraryEntries, users, type Db } from '@perch/db';
import { createIgdbCache } from '../igdb/cache.js';
import type { IgdbClient } from '../igdb/client.js';
import type { Game } from '../igdb/schemas.js';
import type { AddArgs } from './args.js';
import { pickBestMatch } from './match.js';
import type { ImportEntry } from './parse.js';
import { buildGameRow, buildLibraryRow } from './rows.js';

export async function createUser(
  db: Db,
  { email, name }: { email: string; name: string },
): Promise<{ id: string; created: boolean }> {
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (existing) return { id: existing.id, created: false };
  const id = randomUUID();
  await db.insert(users).values({ id, email, name });
  return { id, created: true };
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

/** Resolves the game on IGDB (search or --igdb), upserts it with vocab, upserts the library entry. */
export async function addGame(
  deps: { db: Db; client: IgdbClient; mapVocab: (game: Game) => Record<string, number> },
  userId: string,
  args: Omit<AddArgs, 'name'> & ImportEntry,
  source: 'manual' | 'import',
): Promise<AddedGame> {
  const { db, client, mapVocab } = deps;
  let igdbId = args.igdb;
  if (igdbId === undefined) {
    const { candidates } = await client.searchGames(args.name);
    const pick = pickBestMatch(args.name, candidates);
    if (!pick) throw new Error(`no IGDB match for "${args.name}"`);
    igdbId = pick.igdbId;
  }
  const game = await createIgdbCache({ db, client }).getGame(igdbId);
  if (!game) throw new Error(`IGDB has no game with id ${igdbId}`);

  const row = buildGameRow(game, mapVocab(game));
  await db.insert(games).values(row).onConflictDoUpdate({ target: games.igdbId, set: row });

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
  await db
    .insert(libraryEntries)
    .values(insert)
    .onConflictDoUpdate({
      target: [libraryEntries.userId, libraryEntries.igdbId, libraryEntries.platform],
      set: update,
    });
  return { igdbId, name: game.name };
}
