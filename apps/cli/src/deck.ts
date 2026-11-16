import { parseArgs } from 'node:util';
import { getDeckCategory } from '@perch/core';
import { createDb } from '@perch/db';
import { resolveGame } from './resolve-game.js';

/** `perch deck <game name or igdb id>`: prints the Steam Deck compatibility category. */
export async function deckCommand(argv: string[], dbUrl: () => string): Promise<void> {
  const { positionals } = parseArgs({ args: argv, allowPositionals: true, options: {} });
  const query = positionals.join(' ').trim();
  if (!query) throw new Error('usage: perch deck <game name or igdb id>');
  const db = createDb(dbUrl());
  try {
    const game = await resolveGame(db, query);
    if (!game.steamAppId)
      return void console.log(`${game.name} (igdb ${game.igdbId}): no Steam app id`);
    const category = await getDeckCategory(db, game.steamAppId);
    console.log(`${game.name} (igdb ${game.igdbId}, steam ${game.steamAppId}): ${category}`);
  } finally {
    await db.$client.end();
  }
}
