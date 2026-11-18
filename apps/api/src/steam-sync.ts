import {
  claimSteamAutoSync,
  fetchOwnedGames,
  rebuildProfile,
  releaseSteamAutoSync,
  syncSteamLibrary,
  SteamProfilePrivateError,
  type SteamSyncResult,
} from '@perch/core';
import type { RouteDeps } from './app.js';

export interface SteamSync {
  /** True when this server can import (Steam key and game database both configured). */
  configured: boolean;
  /** Imports now. Concurrent calls for one user share a single import. Throws the core Steam errors. */
  run(userId: string, steamId: string): Promise<SteamSyncResult>;
  /**
   * Fire-and-forget: imports if the last sync is 6 h old or missing. The 6 h rule is enforced in
   * the database (a conditional UPDATE claims the slot), so several instances never double-run.
   * Never throws and never blocks the caller.
   */
  maybeAuto(userId: string, steamId: string | null | undefined): void;
}

export function createSteamSync(
  deps: Pick<RouteDeps, 'db' | 'env' | 'igdb' | 'cache' | 'mapVocab' | 'steamFetch'>,
): SteamSync {
  const { db, env, igdb, cache, mapVocab, steamFetch } = deps;
  const inflight = new Map<string, Promise<SteamSyncResult>>();
  const configured = Boolean(env.STEAM_API_KEY && igdb && cache);

  function run(userId: string, steamId: string): Promise<SteamSyncResult> {
    const running = inflight.get(userId);
    if (running) return running;
    const p = (async () => {
      const result = await syncSteamLibrary(
        {
          db,
          cache: cache!,
          client: igdb!,
          fetchOwned: (id) => fetchOwnedGames(id, { apiKey: env.STEAM_API_KEY, fetch: steamFetch }),
        },
        userId,
        steamId,
      );
      await rebuildProfile(db, userId, new Date(), mapVocab);
      return result;
    })().finally(() => inflight.delete(userId));
    inflight.set(userId, p);
    return p;
  }

  async function auto(userId: string, steamId: string) {
    const claim = await claimSteamAutoSync(db, userId, new Date());
    if (!claim.claimed) return;
    try {
      await run(userId, steamId);
    } catch (err) {
      // A private profile keeps the claim: retrying before 6 h would just hit Steam again for nothing.
      if (err instanceof SteamProfilePrivateError) return;
      // Otherwise give the slot back so the next trigger retries and "last synced" stays truthful.
      await releaseSteamAutoSync(db, userId, claim).catch(() => undefined);
      console.error('steam auto-sync failed', err);
    }
  }

  return {
    configured,
    run,
    maybeAuto(userId, steamId) {
      if (!configured || !steamId || inflight.has(userId)) return;
      void auto(userId, steamId).catch((err) => console.error('steam auto-sync failed', err));
    },
  };
}
