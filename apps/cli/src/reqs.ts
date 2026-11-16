import { parseArgs } from 'node:util';
import { createIgdbCache, createIgdbClientFromEnv, getRequirements } from '@perch/core';
import { createDb } from '@perch/db';
import { mapGame } from '@perch/taste-vocab';

const fmt = (n: number | null) => n ?? '?';

/** `perch reqs <game name or igdb id>`: prints the Steam requirements (tier scores as stored). */
export async function reqsCommand(argv: string[], dbUrl: () => string): Promise<void> {
  const { positionals } = parseArgs({ args: argv, allowPositionals: true, options: {} });
  const query = positionals.join(' ').trim();
  if (!query) throw new Error('usage: perch reqs <game name or igdb id>');
  const db = createDb(dbUrl());
  try {
    const client = createIgdbClientFromEnv();
    const cache = createIgdbCache({ db, client, mapVocab: mapGame });
    const igdbId = /^\d+$/.test(query)
      ? Number(query)
      : (await client.searchGames(query)).best?.igdbId;
    const game = igdbId === undefined ? null : await cache.getGame(igdbId);
    if (!game) throw new Error(`no IGDB match for "${query}"`);
    const row = await getRequirements(db, game.igdbId);
    if (!row) return void console.log(`${game.name} (igdb ${game.igdbId}): no Steam app id`);
    console.log(`${game.name} (igdb ${game.igdbId}, steam ${game.steamAppId})`);
    console.log(
      `min: gpu ${fmt(row.minGpuScore)}, cpu ${fmt(row.minCpuScore)}, ram ${fmt(row.minRamGb)} GB`,
    );
    console.log(
      `rec: gpu ${fmt(row.recGpuScore)}, cpu ${fmt(row.recCpuScore)}, ram ${fmt(row.recRamGb)} GB`,
    );
  } finally {
    await db.$client.end();
  }
}
