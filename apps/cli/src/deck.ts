import { parseArgs } from 'node:util';
import { createIgdbCache, createIgdbClientFromEnv, getDeckCategory } from '@perch/core';
import { createDb } from '@perch/db';
import { mapGame } from '@perch/taste-vocab';

/** `perch deck <game name or igdb id>`: prints the Steam Deck compatibility category. */
export async function deckCommand(argv: string[], dbUrl: () => string): Promise<void> {
  const { positionals } = parseArgs({ args: argv, allowPositionals: true, options: {} });
  const query = positionals.join(' ').trim();
  if (!query) throw new Error('usage: perch deck <game name or igdb id>');
  const db = createDb(dbUrl());
  try {
    const client = createIgdbClientFromEnv();
    const cache = createIgdbCache({ db, client, mapVocab: mapGame });
    const igdbId = /^\d+$/.test(query)
      ? Number(query)
      : (await client.searchGames(query)).best?.igdbId;
    const game = igdbId === undefined ? null : await cache.getGame(igdbId);
    if (!game) throw new Error(`no IGDB match for "${query}"`);
    if (!game.steamAppId)
      return void console.log(`${game.name} (igdb ${game.igdbId}): no Steam app id`);
    const category = await getDeckCategory(db, game.steamAppId);
    console.log(`${game.name} (igdb ${game.igdbId}, steam ${game.steamAppId}): ${category}`);
  } finally {
    await db.$client.end();
  }
}
