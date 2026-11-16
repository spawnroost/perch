import { parseArgs } from 'node:util';
import {
  addFeedback,
  createIgdbCache,
  createIgdbClientFromEnv,
  findUserId,
  rebuildProfile,
  type FeedbackKind,
} from '@perch/core';
import { createDb } from '@perch/db';
import { userEmail } from './commands.js';
import { mapGame } from '@perch/taste-vocab';
import { resolveGame } from './resolve-game.js';

const KINDS: Record<string, FeedbackKind> = {
  up: 'up',
  down: 'down',
  played: 'played',
  'not-interested': 'not_interested',
};

/** `perch feedback <game> <up|down|played|not-interested> [--user email]`. */
export async function feedbackCommand(argv: string[], dbUrl: () => string): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { user: { type: 'string' } },
  });
  const usage = 'usage: perch feedback <game name or igdb id> <up|down|played|not-interested>';
  const kind = KINDS[positionals.at(-1) ?? ''];
  const query = positionals.slice(0, -1).join(' ').trim();
  if (!kind || !query) throw new Error(usage);
  const email = userEmail(values.user);

  const db = createDb(dbUrl());
  try {
    const userId = await findUserId(db, email);
    const game = await resolveGame(db, query);
    const cache = createIgdbCache({ db, client: createIgdbClientFromEnv(), mapVocab: mapGame });
    await addFeedback({ db, cache }, userId, game.igdbId, kind);
    await rebuildProfile(db, userId, new Date(), mapGame);
    console.log(`${kind} for "${game.name}" (igdb ${game.igdbId})`);
  } finally {
    await db.$client.end();
  }
}
