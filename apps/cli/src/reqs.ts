import { parseArgs } from 'node:util';
import {
  createIgdbCache,
  createIgdbClientFromEnv,
  getRequirements,
  parseRequirementsHtml,
  scoreRequirements,
} from '@perch/core';
import { createDb } from '@perch/db';
import { mapGame } from '@perch/taste-vocab';

const fmt = (score: number | null, key: string | null) =>
  score === null ? '?' : `${score} (${key ?? '?'})`;

function formatSide(
  label: string,
  gpu: [number | null, string | null],
  cpu: [number | null, string | null],
  ram: number | null,
): string {
  return `${label}: gpu ${fmt(...gpu)}, cpu ${fmt(...cpu)}, ram ${ram ?? '?'} GB`;
}

/** `perch reqs <game name or igdb id>`: prints the Steam requirements with matched tier keys. */
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
    const [min = '', rec] = (row.raw ?? '').split(/^Recommended:$/m);
    const scores = scoreRequirements({
      min: parseRequirementsHtml(min),
      rec: rec === undefined ? null : parseRequirementsHtml(rec),
    });
    console.log(`${game.name} (igdb ${game.igdbId}, steam ${game.steamAppId})`);
    const s = scores;
    console.log(
      formatSide('min', [s.minGpuScore, s.minGpuKey], [s.minCpuScore, s.minCpuKey], s.minRamGb),
    );
    console.log(
      formatSide('rec', [s.recGpuScore, s.recGpuKey], [s.recCpuScore, s.recCpuKey], s.recRamGb),
    );
  } finally {
    await db.$client.end();
  }
}
