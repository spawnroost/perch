import {
  claimAutoSync,
  fetchTitleHistory,
  rebuildProfile,
  releaseAutoSync,
  syncXboxLibrary,
  XboxProfilePrivateError,
  XboxRateLimitedError,
  type XboxSyncResult,
} from '@perch/core';
import type { RouteDeps } from './app.js';

export interface XboxSync {
  /** True when this server can import (OpenXBL key and game database both configured). */
  configured: boolean;
  /** Imports now. Concurrent calls for one user share a single import. Throws the core Xbox errors. */
  run(userId: string, xuid: string): Promise<XboxSyncResult>;
  /**
   * Fire-and-forget: imports if the last sync is 6 h old or missing (claimed in the database, so
   * instances never double-run). Never throws and never blocks the caller.
   */
  maybeAuto(userId: string, xuid: string | null | undefined): void;
}

export function createXboxSync(
  deps: Pick<RouteDeps, 'db' | 'env' | 'igdb' | 'cache' | 'mapVocab' | 'xboxFetch'>,
): XboxSync {
  const { db, env, igdb, cache, mapVocab, xboxFetch } = deps;
  const inflight = new Map<string, Promise<XboxSyncResult>>();
  const configured = Boolean(env.OPENXBL_API_KEY && igdb && cache);

  function run(userId: string, xuid: string): Promise<XboxSyncResult> {
    const running = inflight.get(userId);
    if (running) return running;
    const p = (async () => {
      const result = await syncXboxLibrary(
        {
          db,
          cache: cache!,
          client: igdb!,
          fetchTitles: (id) =>
            fetchTitleHistory(id, { apiKey: env.OPENXBL_API_KEY, fetch: xboxFetch }),
        },
        userId,
        xuid,
      );
      await rebuildProfile(db, userId, new Date(), mapVocab);
      return result;
    })().finally(() => inflight.delete(userId));
    inflight.set(userId, p);
    return p;
  }

  async function auto(userId: string, xuid: string) {
    const claim = await claimAutoSync(db, userId, new Date(), 'xboxSyncedAt');
    if (!claim.claimed) return;
    try {
      await run(userId, xuid);
    } catch (err) {
      // A private history or a spent rate limit keeps the claim: asking again before 6 h would
      // only hit OpenXBL's shared hourly budget for nothing.
      if (err instanceof XboxProfilePrivateError || err instanceof XboxRateLimitedError) return;
      await releaseAutoSync(db, userId, claim, 'xboxSyncedAt').catch(() => undefined);
      console.error('xbox auto-sync failed', err);
    }
  }

  return {
    configured,
    run,
    maybeAuto(userId, xuid) {
      if (!configured || !xuid || inflight.has(userId)) return;
      void auto(userId, xuid).catch((err) => console.error('xbox auto-sync failed', err));
    },
  };
}
