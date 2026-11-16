import { formatError } from '@perch/core';
import { addCommand, dbUrl, importCommand, userCreateCommand } from './commands.js';
import { igdbRefresh } from './igdb-refresh.js';
import { recommendCommand } from './recommend.js';
import { reqsCommand } from './reqs.js';
import { vocabCheck } from './vocab-check.js';
import { vocabRebuild } from './vocab-rebuild.js';

const USAGE = `usage: perch <command>

commands:
  user:create <email> [--name N]
  add "<game>" [--hours N] [--last YYYY-MM-DD] [--status playing|finished|dropped|backlog]
              [--platform pc] [--owned|--no-owned] [--igdb <id>] [--user <email>]
  import <file> [--platform pc] [--owned|--no-owned] [--user <email>]
  recommend --dry [--user <email>] [--limit 20]
  reqs <game name or igdb id>  Steam PC requirements with matched tiers
  igdb:refresh  refetch every cached game from IGDB (fills new fields)
  vocab:check   list IGDB ids with no taste-vocab mapping
  vocab:rebuild recompute stored games.vocab with the current mapping

--user defaults to the PERCH_USER environment variable.`;

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  try {
    switch (command) {
      case 'user:create':
        await userCreateCommand(rest);
        return 0;
      case 'add':
        await addCommand(rest);
        return 0;
      case 'import':
        return await importCommand(rest);
      case 'recommend':
        await recommendCommand(rest, dbUrl);
        return 0;
      case 'reqs':
        await reqsCommand(rest, dbUrl);
        return 0;
      case 'igdb:refresh': {
        console.log(await igdbRefresh(dbUrl()));
        return 0;
      }
      case 'vocab:check': {
        console.log(await vocabCheck(dbUrl()));
        return 0;
      }
      case 'vocab:rebuild': {
        console.log(await vocabRebuild(dbUrl()));
        return 0;
      }
      default:
        console.error(USAGE);
        return command ? 1 : 0;
    }
  } catch (e) {
    console.error(formatError(e));
    return 1;
  }
}

process.exitCode = await main(process.argv.slice(2));
