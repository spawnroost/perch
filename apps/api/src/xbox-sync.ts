import {
  claimAutoSync,
  fetchTitleHistory,
  rebuildProfile,
  releaseAutoSync,
  syncXboxLibrary,
  XboxAccountChangedError,
  type XboxSyncResult,
} from '@perch/core';
import type { RouteDeps } from './app.js';
import { throttleAttempt } from './throttle.js';

export interface XboxSync {
  /** True when this server can import (OpenXBL key and game database both configured). */
  configured: boolean;
  /** Imports now. Concurrent calls for one user share a single import. Throws the core Xbox errors. */
  run(userId: string, xuid: string): Promise<XboxSyncResult>;
  /**
   * Fire-and-forget: re-imports when the last successful sync is 6 h old (claimed in the database,
   * so instances never double-run). Never runs before a first successful import, so a failed link
   * is not retried behind the user's back, and tries a user at most once a minute. Never throws
   * and never blocks the caller.
   */
  maybeAuto(
    userId: string,
    xuid: string | null | undefined,
    syncedAt: Date | string | null | undefined,
  ): void;
  /**
   * Manual link/sync throttle protecting OpenXBL's shared hourly budget: 0 when the user may go
   * ahead (and the attempt is recorded), else the seconds until they may.
   */
  cooldown(userId: string): number;
  /** Gives back the attempt `cooldown` just recorded, for a try that found no such gamertag. */
  refund(userId: string): void;
}

/** One manual OpenXBL-spending call per user per minute unless the app says otherwise. */
export const XBOX_COOLDOWN_MS = 60_000;

export function createXboxSync(
  deps: Pick<RouteDeps, 'db' | 'env' | 'igdb' | 'cache' | 'mapVocab' | 'xboxFetch'> & {
    cooldownMs?: number;
  },
): XboxSync {
  const { db, env, igdb, cache, mapVocab, xboxFetch } = deps;
  const cooldownMs = deps.cooldownMs ?? XBOX_COOLDOWN_MS;
  const lastManual = new Map<string, number>();
  const lastAuto = new Map<string, number>();

  const throttle = (map: Map<string, number>, userId: string) =>
    throttleAttempt(map, userId, cooldownMs);
  const inflight = new Map<string, Promise<XboxSyncResult>>();
  const configured = Boolean(env.OPENXBL_API_KEY && igdb && cache);

  // Keyed by xuid too: relinking while an import for the old account runs must start its own.
  const key = (userId: string, xuid: string) => `${userId}:${xuid}`;

  function run(userId: string, xuid: string): Promise<XboxSyncResult> {
    const running = inflight.get(key(userId, xuid));
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
    })().finally(() => inflight.delete(key(userId, xuid)));
    inflight.set(key(userId, xuid), p);
    return p;
  }

  async function auto(userId: string, xuid: string) {
    const claim = await claimAutoSync(db, userId, new Date(), 'xboxSyncedAt');
    if (!claim.claimed) return;
    try {
      await run(userId, xuid);
    } catch (err) {
      // The user relinked mid-import: nothing was written and the new link has its own sync.
      if (err instanceof XboxAccountChangedError) return;
      // Any other failure gives the slot back: "last synced" only moves on a successful import.
      await releaseAutoSync(db, userId, claim, 'xboxSyncedAt').catch(() => undefined);
      console.error('xbox auto-sync failed', err);
    }
  }

  return {
    configured,
    run,
    cooldown: (userId) => throttle(lastManual, userId),
    refund: (userId) => void lastManual.delete(userId),
    maybeAuto(userId, xuid, syncedAt) {
      if (!configured || !xuid || !syncedAt || inflight.has(key(userId, xuid))) return;
      if (throttle(lastAuto, userId) > 0) return;
      void auto(userId, xuid).catch((err) => console.error('xbox auto-sync failed', err));
    },
  };
}
