import type { Db } from '@perch/db';
import { getRecsVersion } from '../recommendation-cache/version.js';
import type { RecommendationsResponse } from '../schemas/recommendations.js';
import { buildReasonItems } from './items.js';
import { REASON_TOP_N, type ReasonExplainer } from './schemas.js';
import { loadReasons, saveReasons } from './store.js';
import { DEFAULT_GLOBAL_DAILY_BATCH_CAP, reserveLlmBatch } from './usage.js';

type Rec = RecommendationsResponse['recommendations'][number];

export interface ReasonServiceOptions {
  db: Db;
  /** Null = no LLM configured: reasons stay as the template wrote them. */
  explainer: ReasonExplainer | null;
  globalDailyCap?: number;
  userDailyCap?: number;
  /** Longest a request waits for a batch before answering with `pending`. */
  waitMs?: number;
  /** How long a failed or skipped pick is left alone. */
  retryAfterMs?: number;
  now?: () => Date;
  log?: (message: string, err?: unknown) => void;
}

export interface ReasonOverlay {
  recommendations: Rec[];
  /** True while a batch for these picks is still running. */
  pending: boolean;
}

export interface ReasonService {
  overlay(userId: string, recs: readonly Rec[]): Promise<ReasonOverlay>;
}

export const DEFAULT_REASON_WAIT_MS = 2500;
export const DEFAULT_REASON_RETRY_MS = 10 * 60_000;

/**
 * Puts LLM reasons on the top picks of a feed. Reasons are stored per user and recs version;
 * missing ones are generated in one batch (shared between concurrent requests), awaited briefly,
 * and otherwise left to finish in the background while the template reason stays.
 */
export function createReasonService(o: ReasonServiceOptions): ReasonService {
  const { db, explainer } = o;
  const waitMs = o.waitMs ?? DEFAULT_REASON_WAIT_MS;
  const retryAfterMs = o.retryAfterMs ?? DEFAULT_REASON_RETRY_MS;
  const now = o.now ?? (() => new Date());
  const log = o.log ?? ((m, e) => console.error(m, e));
  const globalCap = o.globalDailyCap ?? DEFAULT_GLOBAL_DAILY_BATCH_CAP;

  /** One batch per user + version at a time. */
  const inflight = new Map<string, Promise<void>>();
  /** Picks that failed or were skipped, per user + version, with when; left alone for `retryAfterMs`. */
  const blocked = new Map<string, Map<number, number>>();

  const isBlocked = (key: string, id: number) => {
    const at = blocked.get(key)?.get(id);
    return at !== undefined && now().getTime() - at < retryAfterMs;
  };
  const block = (key: string, ids: readonly number[]) => {
    const t = now().getTime();
    for (const [k, m] of blocked) {
      for (const [id, at] of m) if (t - at >= retryAfterMs) m.delete(id);
      if (m.size === 0 && k !== key) blocked.delete(k);
    }
    const m = blocked.get(key) ?? new Map<number, number>();
    for (const id of ids) m.set(id, t);
    blocked.set(key, m);
  };

  const apply = (recs: readonly Rec[], texts: ReadonlyMap<number, string>): Rec[] =>
    recs.map((r) => {
      const text = texts.get(r.game.igdbId);
      return text ? { ...r, reason: text } : { ...r };
    });

  return {
    async overlay(userId, recs) {
      if (!explainer || recs.length === 0) return { recommendations: [...recs], pending: false };
      const top = recs.slice(0, REASON_TOP_N);
      const ids = top.map((r) => r.game.igdbId);
      const version = await getRecsVersion(db, userId);
      const key = `${userId}\u0000${version}`;
      let have = await loadReasons(db, userId, version, ids);
      const missing = top.filter((r) => !have.has(r.game.igdbId) && !isBlocked(key, r.game.igdbId));
      if (missing.length === 0) return { recommendations: apply(recs, have), pending: false };

      // Another request's batch is running: it will not cover these picks necessarily, so answer
      // now and let the next ask pick up whatever is still missing.
      if (inflight.has(key)) return { recommendations: apply(recs, have), pending: true };

      const items = buildReasonItems(missing);
      const askedIds = items.map((i) => i.igdbId);
      // Registered before the first await so concurrent requests see this batch.
      const flight = (async () => {
        try {
          if (
            !(await reserveLlmBatch(db, userId, { globalCap, userCap: o.userDailyCap, now: now() }))
          ) {
            block(key, askedIds); // later requests skip the usage check for a while
            return;
          }
          const texts = await explainer.explain(items);
          await saveReasons(db, userId, version, texts);
          block(
            key,
            askedIds.filter((id) => !texts.has(id)),
          );
        } catch (err) {
          log('reasons: batch failed, keeping template reasons', err);
          block(key, askedIds);
        } finally {
          inflight.delete(key);
        }
      })();
      inflight.set(key, flight);

      let timer: ReturnType<typeof setTimeout> | undefined;
      const finished = await Promise.race([
        flight.then(() => true),
        new Promise<boolean>((resolve) => {
          timer = setTimeout(() => resolve(false), waitMs);
        }),
      ]);
      clearTimeout(timer);
      if (!finished) return { recommendations: apply(recs, have), pending: true };
      have = await loadReasons(db, userId, version, ids);
      return { recommendations: apply(recs, have), pending: false };
    },
  };
}
