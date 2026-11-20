import {
  claimAutoSync,
  createPsnClient,
  PsnAccountChangedError,
  PsnAuthFailedError,
  rebuildProfile,
  releaseAutoSync,
  syncPsnLibrary,
  type PsnProfile,
  type PsnSyncResult,
} from '@perch/core';
import type { RouteDeps } from './app.js';
import { throttleAttempt } from './throttle.js';

export interface PsnSync {
  /** True when this server can import (PSN_NPSSO and game database both configured). */
  configured: boolean;
  /** The profile whose online ID is exactly `onlineId`. Throws the core PlayStation errors. */
  lookup(onlineId: string): Promise<PsnProfile>;
  /** Imports now. Concurrent calls for one user share a single import. Throws the core PlayStation errors. */
  run(userId: string, accountId: string): Promise<PsnSyncResult>;
  /**
   * Fire-and-forget: re-imports when the last successful sync is 6 h old (claimed in the database,
   * so instances never double-run). Never runs before a first successful import, so a failed link
   * is not retried behind the user's back, and tries a user at most once a minute. Never throws
   * and never blocks the caller.
   */
  maybeAuto(
    userId: string,
    accountId: string | null | undefined,
    syncedAt: Date | string | null | undefined,
  ): void;
  /**
   * Manual link/sync throttle protecting the PlayStation account the server signs in with: 0 when
   * the user may go ahead (and the attempt is recorded), else the seconds until they may.
   */
  cooldown(userId: string): number;
  /** Gives back the attempt `cooldown` just recorded, for a try that never reached PlayStation's data. */
  refund(userId: string): void;
  /**
   * True for 15 minutes after the server's PlayStation sign-in failed: nothing calls PlayStation
   * meanwhile. Clears on expiry or on the next successful PlayStation call.
   */
  authDown(): boolean;
}

/** How long PlayStation stays switched off after the server's NPSSO is rejected. */
export const PSN_AUTH_DOWN_MS = 15 * 60_000;

/** One manual PlayStation call per user per minute unless the app says otherwise. */
export const PSN_COOLDOWN_MS = 60_000;

export function createPsnSync(
  deps: Pick<RouteDeps, 'db' | 'env' | 'igdb' | 'cache' | 'mapVocab' | 'psnApi'> & {
    cooldownMs?: number;
  },
): PsnSync {
  const { db, env, igdb, cache, mapVocab, psnApi } = deps;
  // One client for the whole server: it caches the access token between requests.
  const client = createPsnClient({ npsso: env.PSN_NPSSO, api: psnApi });
  const cooldownMs = deps.cooldownMs ?? PSN_COOLDOWN_MS;
  const lastManual = new Map<string, number>();
  const lastAuto = new Map<string, number>();

  const throttle = (map: Map<string, number>, userId: string) =>
    throttleAttempt(map, userId, cooldownMs);
  let authDownUntil = 0;
  const authDown = () => Date.now() < authDownUntil;
  /** Runs one PlayStation call: refused while auth is down, flags auth down on a rejected sign-in. */
  async function guarded<T>(fn: () => Promise<T>): Promise<T> {
    if (authDown()) throw new PsnAuthFailedError();
    try {
      const result = await fn();
      authDownUntil = 0;
      return result;
    } catch (err) {
      if (err instanceof PsnAuthFailedError) authDownUntil = Date.now() + PSN_AUTH_DOWN_MS;
      throw err;
    }
  }
  const inflight = new Map<string, Promise<PsnSyncResult>>();
  const configured = Boolean(env.PSN_NPSSO && igdb && cache);

  // Keyed by accountId too: relinking while an import for the old account runs must start its own.
  const key = (userId: string, accountId: string) => `${userId}:${accountId}`;

  function run(userId: string, accountId: string): Promise<PsnSyncResult> {
    const running = inflight.get(key(userId, accountId));
    if (running) return running;
    const p = (async () => {
      const result = await syncPsnLibrary(
        {
          db,
          cache: cache!,
          client: igdb!,
          fetchTitles: (id) => guarded(() => client.fetchPlayedGames(id)),
        },
        userId,
        accountId,
      );
      await rebuildProfile(db, userId, new Date(), mapVocab);
      return result;
    })().finally(() => inflight.delete(key(userId, accountId)));
    inflight.set(key(userId, accountId), p);
    return p;
  }

  async function auto(userId: string, accountId: string) {
    const claim = await claimAutoSync(db, userId, new Date(), 'psnSyncedAt');
    if (!claim.claimed) return;
    try {
      await run(userId, accountId);
    } catch (err) {
      // The user relinked mid-import: nothing was written and the new link has its own sync.
      if (err instanceof PsnAccountChangedError) return;
      // Any other failure gives the slot back: "last synced" only moves on a successful import.
      await releaseAutoSync(db, userId, claim, 'psnSyncedAt').catch(() => undefined);
      console.error('psn auto-sync failed', err);
    }
  }

  return {
    configured,
    lookup: (onlineId) => guarded(() => client.lookupAccountId(onlineId)),
    run,
    cooldown: (userId) => throttle(lastManual, userId),
    refund: (userId) => void lastManual.delete(userId),
    authDown,
    maybeAuto(userId, accountId, syncedAt) {
      if (
        !configured ||
        authDown() ||
        !accountId ||
        !syncedAt ||
        inflight.has(key(userId, accountId))
      )
        return;
      if (throttle(lastAuto, userId) > 0) return;
      void auto(userId, accountId).catch((err) => console.error('psn auto-sync failed', err));
    },
  };
}
