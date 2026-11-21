import { runPriceDigest, type CheapSharkClient, type DigestResult } from '@perch/core';
import type { Db } from '@perch/db';
import type { Mailer } from './mailer.js';

/** How often the price-watch pass runs; each user still gets at most one digest a day. */
export const PRICE_WATCH_INTERVAL_MS = 60 * 60 * 1000;
/** First pass shortly after boot, so a restart does not hit CheapShark during startup. */
const FIRST_RUN_DELAY_MS = 2 * 60 * 1000;

export interface PriceWatchJobDeps {
  db: Db;
  mailer: Mailer;
  webOrigin: string;
  prices?: CheapSharkClient;
  intervalMs?: number;
  firstRunDelayMs?: number;
}

export interface PriceWatchJob {
  /** One pass now; null when one is already running in this process. */
  runOnce(): Promise<DigestResult | null>;
  stop(): void;
}

/**
 * The daily price-watch check, run inside the API process on an interval. Per user the work is
 * claimed in the database (see `runPriceDigest`), so overlapping passes or several instances
 * send nothing twice.
 */
export function startPriceWatchJob(deps: PriceWatchJobDeps): PriceWatchJob {
  let running: Promise<DigestResult | null> | null = null;

  function runOnce() {
    if (running) return Promise.resolve(null);
    running = runPriceDigest({
      db: deps.db,
      webOrigin: deps.webOrigin,
      send: (mail) => deps.mailer.send(mail),
      prices: { client: deps.prices },
    })
      .catch((err) => {
        console.error('price watch pass failed', err);
        return null;
      })
      .finally(() => {
        running = null;
      });
    return running;
  }

  const first = setTimeout(() => void runOnce(), deps.firstRunDelayMs ?? FIRST_RUN_DELAY_MS);
  const every = setInterval(() => void runOnce(), deps.intervalMs ?? PRICE_WATCH_INTERVAL_MS);
  // Never keep the process alive just for the job.
  first.unref();
  every.unref();
  return {
    runOnce,
    stop() {
      clearTimeout(first);
      clearInterval(every);
    },
  };
}
