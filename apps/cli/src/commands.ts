import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import {
  addArgsSchema,
  addGame,
  createIgdbCache,
  createIgdbClientFromEnv,
  createVerifiedUser,
  findUserId,
  formatError,
  NoMatchError,
  parseImportFile,
  rebuildProfile,
  userCreateSchema,
} from '@perch/core';
import { hashPassword } from 'better-auth/crypto';
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

export function userEmail(flag: string | undefined): string {
  const email = flag ?? process.env.PERCH_USER;
  if (!email) throw new Error('no user: pass --user <email> or set PERCH_USER');
  return email.toLowerCase();
}

/** PERCH_PASSWORD, else a prompt on a TTY with no echo. Never an argv value (visible in `ps`). */
async function readPassword(): Promise<string> {
  const fromEnv = process.env.PERCH_PASSWORD;
  if (fromEnv) return fromEnv;
  if (!process.stdin.isTTY) throw new Error('no password: set PERCH_PASSWORD or run on a terminal');
  const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: true });
  const muted = rl as unknown as { _writeToOutput: (s: string) => void };
  muted._writeToOutput = () => {};
  process.stderr.write('Password: ');
  try {
    return await rl.question('');
  } finally {
    rl.close();
    process.stderr.write('\n');
  }
}

export async function userCreateCommand(argv: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { name: { type: 'string' }, 'reset-password': { type: 'boolean' } },
  });
  if (positionals.length > 1) {
    throw new Error('the password is not an argument: set PERCH_PASSWORD or enter it when asked');
  }
  const args = userCreateSchema.parse({
    email: positionals[0],
    password: await readPassword(),
    name: values.name,
  });
  const db = createDb(dbUrl());
  try {
    const { id, created } = await createVerifiedUser(db, args, hashPassword, {
      resetPassword: values['reset-password'] ?? false,
    });
    console.log(`${created ? 'created' : 'password reset'}: ${args.email} (${id}), verified`);
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
    await rebuildProfile(db, userId, new Date(), mapGame);
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
    if (ok > 0) await rebuildProfile(db, userId, new Date(), mapGame);
  } finally {
    await db.$client.end();
  }
  console.log(`imported ${ok}, unmatched ${unmatched}, failed ${failed}`);
  return failed + unmatched > 0 ? 1 : 0;
}
