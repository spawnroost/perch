import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { gameRequirements, games, type Db } from '@perch/db';
import { RateQueue } from '../igdb/queue.js';
import { parseReviewTexts } from '../player-voice/reviews.js';
import type { VoiceReview } from '../player-voice/schemas.js';
import { parseReviewSummary, type SteamReviews } from '../steam-reviews/summary.js';
import { htmlToLines, parseSteamRequirements, scoreRequirements } from './parse.js';

/** Valve retired store.steampowered.com/appreviews on 2026-10-22; this keyless Web API replaced it. */
const REVIEWS_URL = 'https://api.steampowered.com/IUserReviewsService/GetAppReviews/v1/';
const API_URL = 'https://store.steampowered.com/api/appdetails';
export const REQUIREMENTS_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Per block, so a long minimum section cannot crowd out the recommended one. */
const RAW_MAX_CHARS = 1200;

export class SteamError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    /** 'http': request failed (maybe retryable); 'body': Steam answered with something unreadable. */
    readonly kind: 'http' | 'body' = 'http',
  ) {
    super(message);
    this.name = 'SteamError';
  }
}

export interface PcRequirementsHtml {
  minimum?: string;
  recommended?: string;
}

export interface SteamClientOptions {
  /** Injected in tests; defaults to the global fetch. */
  fetch?: typeof fetch;
  /** Clock and sleep, injectable for tests. */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Steam's store API is unofficial: stay polite (default 1 request per second). */
  maxPerSecond?: number;
  maxRetries?: number;
  /** First backoff delay; doubles per retry. */
  backoffMs?: number;
}

export type DeckCategory = 'verified' | 'playable' | 'unsupported' | 'unknown';

export interface SteamClient {
  /** `{}` when the app is unknown to Steam or lists no PC requirements. */
  getPcRequirements(appId: number): Promise<PcRequirementsHtml>;
  /** Steam Deck compatibility; 'unknown' when Steam has no (readable) report for the app. */
  getDeckCompat(appId: number): Promise<DeckCategory>;
  /** User-review summary; null when the app has no reviews or Steam answers unreadably. */
  getReviewSummary(appId: number): Promise<SteamReviews | null>;
  /**
   * The most helpful English review texts (see `pickReviews`); empty when the app has none.
   * Throws when Steam answers with something other than review JSON.
   */
  getReviewTexts(appId: number): Promise<VoiceReview[]>;
}

const DECK_URL = 'https://store.steampowered.com/saleaction/ajaxgetdeckappcompatibilityreport';
const DECK_CATEGORIES: Record<number, DeckCategory> = {
  0: 'unknown',
  1: 'unsupported',
  2: 'playable',
  3: 'verified',
};

const responseSchema = z.record(
  z.string(),
  z.object({ success: z.boolean(), data: z.unknown().optional() }),
);
const dataSchema = z.object({
  pc_requirements: z
    .union([
      z.object({ minimum: z.string().optional(), recommended: z.string().optional() }),
      z.array(z.unknown()),
    ])
    .optional(),
});

const deckSchema = z.object({ results: z.object({ resolved_category: z.number() }) });

/** The `{ "<id>": { success, data } }` entry for an app; anything else is a SteamError('body'). */
async function readEntry(
  res: Response,
  id: number,
): Promise<z.infer<typeof responseSchema>[string]> {
  let body: unknown;
  try {
    body = JSON.parse(await res.text());
  } catch {
    throw new SteamError(`Steam appdetails ${id}: response is not JSON`, res.status, 'body');
  }
  const parsed = responseSchema.safeParse(body);
  const entry = parsed.success ? parsed.data[String(id)] : undefined;
  if (!entry)
    throw new SteamError(`Steam appdetails ${id}: unexpected response shape`, res.status, 'body');
  return entry;
}

export function createSteamClient(opts: SteamClientOptions = {}): SteamClient {
  const doFetch: typeof fetch = opts.fetch ?? ((...args) => fetch(...args));
  const queue = new RateQueue(opts.maxPerSecond ?? 1, { now: opts.now, sleep: opts.sleep });
  const maxRetries = opts.maxRetries ?? 3;
  const backoffMs = opts.backoffMs ?? 1000;

  /** GET with the shared queue and retry/backoff; throws SteamError on a final HTTP failure. */
  async function request(url: string, label: string, id: number): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      const res = await queue.schedule(() =>
        doFetch(url, { headers: { accept: 'application/json' } }),
      );
      if (res.ok) return res;
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt >= maxRetries) {
        throw new SteamError(`Steam ${label} ${id} failed: HTTP ${res.status}`, res.status);
      }
      // Pause the shared queue so concurrent callers back off too, not just this one.
      const retryAfter = Number(res.headers.get('retry-after'));
      queue.pause(retryAfter > 0 ? retryAfter * 1000 : backoffMs * 2 ** attempt);
    }
  }

  return {
    async getPcRequirements(appId) {
      const id = Math.trunc(appId);
      // `filters=pc_requirements` alone now returns data: []; `basic` is needed alongside it.
      const url = `${API_URL}?appids=${id}&filters=basic,pc_requirements`;
      const entry = await readEntry(await request(url, 'appdetails', id), id);
      if (!entry.success) return {};
      const data = dataSchema.safeParse(entry.data);
      const pc = data.success ? data.data.pc_requirements : undefined;
      if (!pc || Array.isArray(pc)) return {};
      return { minimum: pc.minimum, recommended: pc.recommended };
    },

    async getDeckCompat(appId) {
      const id = Math.trunc(appId);
      const res = await request(`${DECK_URL}?nAppID=${id}`, 'deck report', id);
      let body: unknown;
      try {
        body = JSON.parse(await res.text());
      } catch {
        throw new SteamError(`Steam deck report ${id}: response is not JSON`, res.status, 'body');
      }
      // Unknown apps answer `results: []`; any other unexpected shape also means no report.
      const parsed = deckSchema.safeParse(body);
      return (
        (parsed.success && DECK_CATEGORIES[parsed.data.results.resolved_category]) || 'unknown'
      );
    },

    async getReviewSummary(appId) {
      const id = Math.trunc(appId);
      const url = `${REVIEWS_URL}?appid=${id}&num_per_page=1&languages%5B0%5D=all&purchase_type=0&review_type=0`;
      const res = await request(url, 'reviews', id);
      try {
        return parseReviewSummary(JSON.parse(await res.text()));
      } catch {
        return null;
      }
    },

    async getReviewTexts(appId) {
      const id = Math.trunc(appId);
      // filter 0 = most helpful; day_range 0 = all time (default is 30 days).
      const url = `${REVIEWS_URL}?appid=${id}&filter=0&day_range=0&purchase_type=0&num_per_page=100&review_type=0`;
      const res = await request(url, 'review texts', id);
      let body: unknown;
      try {
        body = JSON.parse(await res.text());
      } catch {
        throw new SteamError(`Steam review texts ${id}: response is not JSON`, res.status, 'body');
      }
      return parseReviewTexts(body);
    },
  };
}

export type RequirementsRow = typeof gameRequirements.$inferSelect;

export interface GetRequirementsOptions {
  client?: SteamClient;
  ttlMs?: number;
  now?: () => Date;
}

let sharedClient: SteamClient | undefined;

/** The one Steam store client (and so one rate queue) for requirements, deck and reviews. */
export function getSharedSteamClient(): SteamClient {
  return (sharedClient ??= createSteamClient());
}

/** Plain-text excerpt of the min/rec blocks that the scores were parsed from. */
export function requirementsExcerpt(pc: PcRequirementsHtml): string | null {
  const block = (label: string, html?: string) => {
    // Drop only the block's own leading header: an inline "Recommended:" line is the boundary.
    const all = html ? htmlToLines(html) : [];
    const isHeader = all[0]?.replace(/:$/, '').toLowerCase() === label.toLowerCase();
    const lines = isHeader ? all.slice(1) : all;
    return lines.length ? [`${label}:`, ...lines].join('\n').slice(0, RAW_MAX_CHARS) : null;
  };
  const text = [block('Minimum', pc.minimum), block('Recommended', pc.recommended)]
    .filter(Boolean)
    .join('\n');
  return text || null;
}

/**
 * Steam requirements for a game: the cached `steam` row if fresher than the TTL, else fetched by
 * `games.steam_app_id`, parsed, upserted and returned. Null if the game has no Steam app id.
 * If a refetch fails, answers unreadably or lists nothing while a row exists, that row is kept.
 * An unreadable answer with no row yields null.
 */
export async function getRequirements(
  db: Db,
  igdbId: number,
  opts: GetRequirementsOptions = {},
): Promise<RequirementsRow | null> {
  const { ttlMs = REQUIREMENTS_TTL_MS, now = () => new Date() } = opts;
  const steamRow = and(eq(gameRequirements.igdbId, igdbId), eq(gameRequirements.source, 'steam'));
  const [cached] = await db.select().from(gameRequirements).where(steamRow);
  if (cached && now().getTime() - cached.parsedAt.getTime() < ttlMs) return cached;

  const [game] = await db
    .select({ steamAppId: games.steamAppId })
    .from(games)
    .where(eq(games.igdbId, igdbId));
  if (!game?.steamAppId) return cached ?? null;

  const client = opts.client ?? getSharedSteamClient();
  let pc: PcRequirementsHtml;
  try {
    pc = await client.getPcRequirements(game.steamAppId);
  } catch (err) {
    if (cached) return cached;
    // An unreadable (non-retryable) body means "no requirements known": nothing to cache.
    if (err instanceof SteamError && err.kind === 'body') return null;
    throw err;
  }
  if (cached && !pc.minimum && !pc.recommended) {
    // Steam now lists nothing (delisted, region lock, flaky answer): keep the good row.
    const [kept] = await db
      .update(gameRequirements)
      .set({ parsedAt: now() })
      .where(steamRow)
      .returning();
    return kept ?? cached;
  }
  const s = scoreRequirements(parseSteamRequirements(pc));
  const values = {
    minGpuScore: s.minGpuScore,
    minCpuScore: s.minCpuScore,
    minRamGb: s.minRamGb,
    recGpuScore: s.recGpuScore,
    recCpuScore: s.recCpuScore,
    recRamGb: s.recRamGb,
    raw: requirementsExcerpt(pc),
    parsedAt: now(),
  };
  const [row] = await db
    .insert(gameRequirements)
    .values({ igdbId, source: 'steam', ...values })
    .onConflictDoUpdate({ target: [gameRequirements.igdbId, gameRequirements.source], set: values })
    .returning();
  return row ?? null;
}
