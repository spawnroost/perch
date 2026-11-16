import { parseArgs } from 'node:util';
import {
  createIgdbCache,
  createIgdbClientFromEnv,
  createNoneProvider,
  findUserId,
  createFitFetchers,
  loadDevices,
  loadRecommendInput,
  selectDevices,
  recommend,
  type Recommendation,
} from '@perch/core';
import { createDb } from '@perch/db';
import { userEmail } from './commands.js';
import { mapGame, VOCAB } from '@perch/taste-vocab';

const DEFAULT_LIMIT = 20;

export function formatRecommendations(recs: readonly Recommendation[]): string {
  if (recs.length === 0) return 'no recommendations (is the library empty?)';
  return recs
    .map((r) => {
      const year = r.game.firstRelease?.getUTCFullYear() ?? '----';
      const name = r.backlog ? `${r.game.name} [backlog]` : r.game.name;
      const fit = r.fit ? `  [${r.fit.status}]` : '';
      return `${String(r.rank).padStart(2)}. ${name} (${year})  ${r.score.toFixed(3)}${fit}  ${r.reason}`;
    })
    .join('\n');
}

/**
 * `perch recommend [--device <id|preset-id|all|none>] [--user email] [--limit 20]`: prints the
 * ranking, writes nothing. Filters by the user's devices unless `--device none`.
 */
export async function recommendCommand(argv: string[], dbUrl: () => string): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      dry: { type: 'boolean' },
      device: { type: 'string' },
      user: { type: 'string' },
      limit: { type: 'string' },
    },
  });
  const limit = values.limit === undefined ? DEFAULT_LIMIT : Number(values.limit);
  if (!Number.isInteger(limit) || limit < 1) throw new Error('--limit must be a positive integer');
  const email = userEmail(values.user);

  const db = createDb(dbUrl());
  try {
    const userId = await findUserId(db, email);
    const client = createIgdbClientFromEnv();
    const cache = createIgdbCache({ db, client, mapVocab: mapGame });
    const { library, feedback } = await loadRecommendInput(db, userId, mapGame);
    const devices = selectDevices(await loadDevices(db, userId), values.device);
    const recs = await recommend(
      {
        getGames: (ids) => cache.getGames(ids),
        queryByTags: (q) => cache.queryByTags(q),
        mapVocab: mapGame,
        ...createFitFetchers(db),
        explain: createNoneProvider({
          labels: Object.fromEntries(VOCAB.map((v) => [v.id, v.label])),
        }),
      },
      { library, feedback, limit, devices },
    );
    console.log(formatRecommendations(recs));
  } finally {
    await db.$client.end();
  }
}
