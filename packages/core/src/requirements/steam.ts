import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { gameRequirements, games, type Db } from '@perch/db';
import { RateQueue } from '../igdb/queue.js';
import { htmlToLines, parseSteamRequirements, scoreRequirements } from './parse.js';

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

export interface SteamClient {
  /** `{}` when the app is unknown to Steam or lists no PC requirements. */
  getPcRequirements(appId: number): Promise<PcRequirementsHtml>;
}

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

  return {
    async getPcRequirements(appId) {
      const id = Math.trunc(appId);
      // `filters=pc_requirements` alone now returns data: []; `basic` is needed alongside it.
      const url = `${API_URL}?appids=${id}&filters=basic,pc_requirements`;
      for (let attempt = 0; ; attempt++) {
        const res = await queue.schedule(() =>
          doFetch(url, { headers: { accept: 'application/json' } }),
        );
        if (res.ok) {
          const entry = await readEntry(res, id);
          if (!entry.success) return {};
          const data = dataSchema.safeParse(entry.data);
          const pc = data.success ? data.data.pc_requirements : undefined;
          if (!pc || Array.isArray(pc)) return {};
          return { minimum: pc.minimum, recommended: pc.recommended };
        }
        const retryable = res.status === 429 || res.status >= 500;
        if (!retryable || attempt >= maxRetries) {
          throw new SteamError(`Steam appdetails ${id} failed: HTTP ${res.status}`, res.status);
        }
        // Pause the shared queue so concurrent callers back off too, not just this one.
        const retryAfter = Number(res.headers.get('retry-after'));
        queue.pause(retryAfter > 0 ? retryAfter * 1000 : backoffMs * 2 ** attempt);
      }
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

  const client = opts.client ?? (sharedClient ??= createSteamClient());
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
