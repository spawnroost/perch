import { serve } from '@hono/node-server';
import { createIgdbClientFromEnv } from '@perch/core';
import { createDb } from '@perch/db';
import { createApp } from './app.js';
import { parseServerEnv } from './env.js';
import { createMailer, skipPlaceholderRecipients } from './mailer.js';
import { startPriceWatchJob } from './price-watch-job.js';

const env = parseServerEnv(process.env);
const igdb =
  process.env.IGDB_CLIENT_ID && process.env.IGDB_CLIENT_SECRET
    ? createIgdbClientFromEnv()
    : undefined;
if (!igdb) console.warn('IGDB_CLIENT_ID / IGDB_CLIENT_SECRET not set: game routes answer 503');
const db = createDb(env.DATABASE_URL);
const mailer = createMailer(env);
const app = createApp({ db, env, mailer, igdb });
startPriceWatchJob({ db, mailer: skipPlaceholderRecipients(mailer), webOrigin: env.WEB_ORIGIN });
serve({ fetch: app.fetch, port: env.API_PORT }, (info) => {
  console.log(`api listening on http://localhost:${info.port}`);
});
