import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import {
  addArgsSchema,
  addGame,
  createIgdbCache,
  createIgdbClientFromEnv,
  createUser,
  findUserId,
  formatError,
  NoMatchError,
  parseImportFile,
  userCreateSchema,
} from '@perch/core';
import { createDb } from '@perch/db';
import { mapGame } from '@perch/taste-vocab';

export function dbUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  return url;
}

const sharedOptions = {
  user: { type: 'string' },
  platform: { type: 'string' },
  owned: { type: 'boolean' },
} as const;
// `--no-owned` sets owned=false; omitting both leaves it to the DB default / existing row.
const NEGATABLE = { allowNegative: true } as const;

function userEmail(flag: string | undefined): string {
  const email = flag ?? process.env.PERCH_USER;
  if (!email) throw new Error('no user: pass --user <email> or set PERCH_USER');
  return email.toLowerCase();
}

export async function userCreateCommand(argv: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { name: { type: 'string' } },
  });
  const args = userCreateSchema.parse({ email: positionals[0], name: values.name });
  const db = createDb(dbUrl());
  try {
    const { id, created } = await createUser(db, args);
    console.log(`${created ? 'created' : 'exists'}: ${args.email} (${id})`);
  } finally {
    await db.$client.end();
  }
}

export async function addCommand(argv: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    ...NEGATABLE,
    options: {
      ...sharedOptions,
      hours: { type: 'string' },
      last: { type: 'string' },
      status: { type: 'string' },
      igdb: { type: 'string' },
    },
  });
  const args = addArgsSchema.parse({ ...values, name: positionals[0] });
  const email = userEmail(values.user);
  const db = createDb(dbUrl());
  try {
    const userId = await findUserId(db, email);
    const client = createIgdbClientFromEnv();
    const deps = {
      db,
      client,
      cache: createIgdbCache({ db, client, mapVocab: mapGame }),
      mapVocab: mapGame,
    };
    const added = await addGame(deps, userId, args, 'manual');
    console.log(`added "${added.name}" (igdb ${added.igdbId}) for ${email}`);
  } finally {
    await db.$client.end();
  }
}

/** Returns the process exit code (1 if any line failed). */
export async function importCommand(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    ...NEGATABLE,
    options: sharedOptions,
  });
  const file = positionals[0];
  if (!file) throw new Error('usage: perch import <file>');
  const common = addArgsSchema.parse({ name: 'x', platform: values.platform, owned: values.owned });
  const email = userEmail(values.user);
  const { entries, errors } = parseImportFile(await readFile(file, 'utf8'));
  for (const e of errors) console.error(`line ${e.line}: ${e.error}`);

  const db = createDb(dbUrl());
  let ok = 0;
  let unmatched = 0;
  let failed = errors.length;
  try {
    const userId = await findUserId(db, email);
    const client = createIgdbClientFromEnv();
    const deps = {
      db,
      client,
      cache: createIgdbCache({ db, client, mapVocab: mapGame }),
      mapVocab: mapGame,
    };
    for (const { line, value } of entries) {
      try {
        const added = await addGame(deps, userId, { ...common, ...value }, 'import');
        ok++;
        console.log(`line ${line}: "${value.name}" -> "${added.name}" (igdb ${added.igdbId})`);
      } catch (e) {
        if (e instanceof NoMatchError) unmatched++;
        else failed++;
        console.error(
          `line ${line}: ${e instanceof NoMatchError ? 'unmatched: ' : `"${value.name}": `}${formatError(e)}`,
        );
      }
    }
  } finally {
    await db.$client.end();
  }
  console.log(`imported ${ok}, unmatched ${unmatched}, failed ${failed}`);
  return failed + unmatched > 0 ? 1 : 0;
}
