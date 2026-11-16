import { serve } from '@hono/node-server';
import { createDb } from '@perch/db';
import { createApp } from './app.js';
import { parseServerEnv } from './env.js';
import { createMailer } from './mailer.js';

const env = parseServerEnv(process.env);
const app = createApp({ db: createDb(env.DATABASE_URL), env, mailer: createMailer(env) });
serve({ fetch: app.fetch, port: env.API_PORT }, (info) => {
  console.log(`api listening on http://localhost:${info.port}`);
});
