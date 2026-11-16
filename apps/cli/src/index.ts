import { vocabCheck } from './vocab-check.js';

const USAGE =
  'usage: perch <command>\n\ncommands:\n  vocab:check   list IGDB ids with no taste-vocab mapping';

try {
  process.loadEnvFile('.env');
} catch {
  // no .env file; rely on the real environment
}

async function main(argv: string[]): Promise<number> {
  const [command] = argv;
  switch (command) {
    case 'vocab:check': {
      const url = process.env.DATABASE_URL;
      if (!url) {
        console.error('DATABASE_URL not set');
        return 1;
      }
      console.log(await vocabCheck(url));
      return 0;
    }
    default:
      console.error(USAGE);
      return command ? 1 : 0;
  }
}

process.exitCode = await main(process.argv.slice(2));
