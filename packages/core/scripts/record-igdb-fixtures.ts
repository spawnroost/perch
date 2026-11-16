// Records real IGDB responses into test/fixtures/igdb/. Run once (needs network + creds):
//   pnpm --filter @perch/core record:igdb-fixtures
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createIgdbClient } from '../src/igdb/client.js';

const GAMES = ['Hades', 'Hollow Knight', 'Elden Ring', 'Stardew Valley', 'Celeste'];
const outDir = fileURLToPath(new URL('../test/fixtures/igdb/', import.meta.url));

type Recorded = { search?: unknown; game?: unknown; timeToBeat?: unknown };
let current: Recorded = {};

const recordingFetch: typeof fetch = async (input, init) => {
  const res = await fetch(input, init);
  const url = String(input);
  if (url.includes('/v4/')) {
    const body = await res.clone().json();
    const text = String(init?.body ?? '');
    if (url.endsWith('/game_time_to_beats')) current.timeToBeat = body;
    else if (text.startsWith('search ')) current.search = body;
    else current.game = body;
  }
  return res;
};

const { IGDB_CLIENT_ID: clientId, IGDB_CLIENT_SECRET: clientSecret } = process.env;
if (!clientId || !clientSecret) throw new Error('IGDB_CLIENT_ID / IGDB_CLIENT_SECRET not set');
const client = createIgdbClient({ clientId, clientSecret, fetch: recordingFetch });

mkdirSync(outDir, { recursive: true });
for (const name of GAMES) {
  current = {};
  const { best } = await client.searchGames(name);
  if (!best) throw new Error(`no IGDB match for ${name}`);
  await client.getGame(best.igdbId);
  await client.getTimeToBeat(best.igdbId);
  const slug = name.toLowerCase().replace(/\s+/g, '-');
  writeFileSync(
    `${outDir}${slug}.json`,
    JSON.stringify({ name, igdbId: best.igdbId, ...current }, null, 2) + '\n',
  );
  console.log(`recorded ${slug} (igdb ${best.igdbId})`);
}
