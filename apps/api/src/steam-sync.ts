import { eq } from 'drizzle-orm';
import {
  SteamProfilePrivateError,
  fetchOwnedGames,
  rebuildProfile,
  shouldAutoSync,
  syncSteamLibrary,
  type SteamSyncResult,
} from '@perch/core';
import { users } from '@perch/db';
import type { RouteDeps } from './app.js';

const CHECK_EVERY_MS = 10 * 60_000;
const PRIVATE_BACKOFF_MS = 6 * 3_600_000;
const FAILURE_BACKOFF_MS = 30 * 60_000;

export interface SteamSync {
  /** True when this server can import (Steam key and game database both configured). */
  configured: boolean;
  /** Imports now. Concurrent calls for one user share a single import. Throws the core Steam errors. */
  run(userId: string, steamId: string): Promise<SteamSyncResult>;
  /**
   * Fire-and-forget: imports if the last sync is 6 h old or missing. Never throws and never
   * blocks the caller; a per-user in-memory throttle keeps it from querying on every request.
   */
  maybeAuto(userId: string, steamId: string | null | undefined): void;
  /** Resolves when no auto-sync is running (tests). */
  idle(): Promise<void>;
}

export function createSteamSync(
  deps: Pick<RouteDeps, 'db' | 'env' | 'igdb' | 'cache' | 'mapVocab' | 'steamFetch'>,
): SteamSync {
  const { db, env, igdb, cache, mapVocab, steamFetch } = deps;
  const inflight = new Map<string, Promise<SteamSyncResult>>();
  const nextCheck = new Map<string, number>();
  const background = new Set<Promise<void>>();
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

  async function auto(userId: string) {
    const [row] = await db
      .select({ steamId: users.steamId, syncedAt: users.steamSyncedAt })
      .from(users)
      .where(eq(users.id, userId));
    if (!row?.steamId || !shouldAutoSync(row.syncedAt, new Date())) return;
    try {
      await run(userId, row.steamId);
    } catch (err) {
      const backoff =
        err instanceof SteamProfilePrivateError ? PRIVATE_BACKOFF_MS : FAILURE_BACKOFF_MS;
      nextCheck.set(userId, Date.now() + backoff);
      if (!(err instanceof SteamProfilePrivateError)) console.error('steam auto-sync failed', err);
    }
  }

  return {
    configured,
    run,
    maybeAuto(userId, steamId) {
      if (!configured || !steamId || inflight.has(userId)) return;
      const now = Date.now();
      if (now < (nextCheck.get(userId) ?? 0)) return;
      nextCheck.set(userId, now + CHECK_EVERY_MS);
      const task: Promise<void> = auto(userId)
        .catch((err) => console.error('steam auto-sync failed', err))
        .finally(() => background.delete(task));
      background.add(task);
    },
    async idle() {
      while (background.size > 0) await Promise.all([...background]);
    },
  };
}
