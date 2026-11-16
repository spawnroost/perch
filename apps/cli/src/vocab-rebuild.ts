import { rebuildVocab } from '@perch/core';
import { createDb } from '@perch/db';
import { mapGame } from '@perch/taste-vocab';

/** Recomputes games.vocab for every cached game with the current taste-vocab mapping. */
export async function vocabRebuild(databaseUrl: string): Promise<string> {
  const db = createDb(databaseUrl);
  try {
    const n = await rebuildVocab(db, mapGame);
    return `rebuilt vocab for ${n} games`;
  } finally {
    await db.$client.end();
  }
}
