import { formatError } from '@perch/core';
import { addCommand, dbUrl, importCommand, userCreateCommand } from './commands.js';
import { igdbRefresh } from './igdb-refresh.js';
import { recommendCommand } from './recommend.js';
import { deckCommand } from './deck.js';
import { deviceCommand } from './device.js';
import { feedbackCommand } from './feedback.js';
import { reqsCommand } from './reqs.js';
import { vocabCheck } from './vocab-check.js';
import { vocabRebuild } from './vocab-rebuild.js';

const USAGE = `usage: perch <command>

commands:
  user:create <email> [--name N] [--reset-password]   (verified, password login;
              password from PERCH_PASSWORD or a hidden prompt)
  add "<game>" [--hours N] [--last YYYY-MM-DD] [--status playing|finished|dropped|backlog]
              [--platform pc] [--owned|--no-owned] [--igdb <id>] [--user <email>]
  import <file> [--platform pc] [--owned|--no-owned] [--user <email>]
  device add <preset-id|pc> [--default] [--gpu N --cpu N --ram GB]  |  device list  |  device rm <id>
  recommend [--device <id|preset-id|all|none>] [--user <email>] [--limit 20]
  reqs <game name or igdb id>  Steam PC requirements with matched tiers
  deck <game name or igdb id>  Steam Deck compatibility (cached 7 days)
  feedback <game> <up|down|played|not-interested> [--user <email>]
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
      case 'deck':
        await deckCommand(rest, dbUrl);
        return 0;
      case 'device':
        await deviceCommand(rest, dbUrl);
        return 0;
      case 'feedback':
        await feedbackCommand(rest, dbUrl);
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
