import { imageUrl } from './image.js';
import type { z } from 'zod';
import { RateQueue } from './queue.js';
import {
  igdbGameSchema,
  igdbExternalGamesResponseSchema,
  igdbGamesResponseSchema,
  igdbKeywordsResponseSchema,
  igdbSearchResponseSchema,
  igdbTimeToBeatResponseSchema,
  seriesIds,
  type Game,
  type GameCandidate,
  type SearchResult,
  type TimeToBeat,
} from './schemas.js';
import { TokenProvider } from './token.js';

const API_BASE = 'https://api.igdb.com/v4';
/** `external_game_source` id for Steam (the `category` field is deprecated). */
export const STEAM_SOURCE_ID = 1;

const GAME_FIELDS = [
  'name',
  'slug',
  'summary',
  'cover.image_id',
  'artworks.image_id',
  'screenshots.image_id',
  'first_release_date',
  'total_rating',
  'total_rating_count',
  'genres',
  'themes',
  'keywords',
  'player_perspectives',
  'game_modes',
  'platforms',
  'similar_games',
  'collections',
  'franchises',
  'external_games.uid',
  'external_games.external_game_source',
].join(',');

export class IgdbError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'IgdbError';
  }
}

export interface IgdbClientOptions {
  clientId: string;
  clientSecret: string;
  /** Injected in tests; defaults to the global fetch. */
  fetch?: typeof fetch;
  maxPerSecond?: number;
  maxRetries?: number;
  /** First backoff delay; doubles per retry. */
  backoffMs?: number;
}

export interface TagQuery {
  /** IGDB genre / theme ids; a game matches if it has any of them. */
  genres: readonly number[];
  themes: readonly number[];
  minRatingCount: number;
  /** Capped at 500 (the IGDB maximum per query). */
  limit: number;
}

/** IGDB's maximum page size, and so the id-batch size for getGames. */
export const IGDB_MAX_LIMIT = 500;

export interface IgdbClient {
  searchGames(name: string): Promise<SearchResult>;
  getGame(igdbId: number): Promise<Game | null>;
  /** Batched lookup (<= 500 ids per query). Unknown ids are omitted; order is not preserved. */
  getGames(igdbIds: readonly number[]): Promise<Game[]>;
  /** Best-rated main games (game_type 0) matching any genre/theme, with at least minRatingCount ratings. */
  queryByTags(q: TagQuery): Promise<Game[]>;
  getTimeToBeat(igdbId: number): Promise<TimeToBeat | null>;
  /** Keyword id -> name (<= 500 ids per query). Unknown ids are omitted. */
  keywordNames(ids: readonly number[]): Promise<Record<number, string>>;
  /** Steam appid -> IGDB game id via `external_games` (<= 500 uids per query). Unknown appids are omitted. */
  steamAppIds(appids: readonly number[]): Promise<Map<number, number>>;
}

type RawGame = z.output<typeof igdbGameSchema>;

function toGame(g: RawGame): Game {
  const steam = g.external_games?.find(
    (e) => e.external_game_source === STEAM_SOURCE_ID && e.uid && /^\d+$/.test(e.uid),
  );
  const heroId = g.artworks?.[0]?.image_id ?? g.screenshots?.[0]?.image_id;
  return {
    igdbId: g.id,
    name: g.name,
    slug: g.slug,
    coverUrl: g.cover ? imageUrl('t_cover_big', g.cover.image_id) : null,
    coverUrlSmall: g.cover ? imageUrl('t_cover_small', g.cover.image_id) : null,
    heroUrl: heroId ? imageUrl('t_1080p', heroId) : null,
    // Computed from the cover by the cache, not by IGDB.
    accent: null,
    summary: g.summary ?? null,
    firstRelease: g.first_release_date ? new Date(g.first_release_date * 1000) : null,
    genres: g.genres ?? [],
    themes: g.themes ?? [],
    keywords: g.keywords ?? [],
    perspectives: g.player_perspectives ?? [],
    gameModes: g.game_modes ?? [],
    platforms: g.platforms ?? [],
    similarIds: g.similar_games ?? [],
    series: seriesIds(g),
    rating: g.total_rating ?? null,
    ratingCount: g.total_rating_count ?? null,
    steamAppId: steam?.uid ? Number(steam.uid) : null,
  };
}

const idList = (ids: readonly number[]) => ids.map((n) => Math.trunc(n)).join(',');

export function createIgdbClient(opts: IgdbClientOptions): IgdbClient {
  const doFetch: typeof fetch = opts.fetch ?? ((...args) => fetch(...args));
  const tokens = new TokenProvider({ ...opts, fetch: doFetch });
  const queue = new RateQueue(opts.maxPerSecond ?? 4);
  const maxRetries = opts.maxRetries ?? 4;
  const backoffMs = opts.backoffMs ?? 500;

  /** POSTs an Apicalypse query; retries 429/5xx with backoff and refreshes the token once on 401. */
  async function query<S extends z.ZodType>(
    endpoint: string,
    body: string,
    schema: S,
  ): Promise<z.output<S>> {
    let refreshedAfter401 = false;
    for (let attempt = 0; ; attempt++) {
      const token = await tokens.get();
      const res = await queue.schedule(() =>
        doFetch(`${API_BASE}/${endpoint}`, {
          method: 'POST',
          headers: {
            'Client-ID': opts.clientId,
            Authorization: `Bearer ${token}`,
            'Content-Type': 'text/plain',
          },
          body,
        }),
      );
      if (res.ok) return schema.parse(await res.json());
      if (res.status === 401 && !refreshedAfter401) {
        refreshedAfter401 = true;
        await tokens.refresh();
        attempt--;
        continue;
      }
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt >= maxRetries) {
        throw new IgdbError(`IGDB ${endpoint} failed: HTTP ${res.status}`, res.status);
      }
      const retryAfter = Number(res.headers.get('retry-after'));
      const delay = retryAfter > 0 ? retryAfter * 1000 : backoffMs * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  return {
    async searchGames(name) {
      const q = name.replace(/["\\]/g, ' ').trim();
      const rows = await query(
        'games',
        `search "${q}"; fields name,slug,total_rating_count,first_release_date,cover.image_id; limit 20;`,
        igdbSearchResponseSchema,
      );
      const candidates = rows
        .map((r): GameCandidate => ({
          igdbId: r.id,
          name: r.name,
          slug: r.slug ?? null,
          ratingCount: r.total_rating_count ?? 0,
          firstRelease: r.first_release_date ? new Date(r.first_release_date * 1000) : null,
          coverUrl: r.cover ? imageUrl('t_cover_big', r.cover.image_id) : null,
          coverUrlSmall: r.cover ? imageUrl('t_cover_small', r.cover.image_id) : null,
        }))
        // Stable sort: ties keep IGDB's relevance order.
        .sort((a, b) => b.ratingCount - a.ratingCount);
      return { best: candidates[0] ?? null, candidates };
    },

    async getGame(igdbId) {
      const [g] = await query(
        'games',
        `fields ${GAME_FIELDS}; where id = ${Math.trunc(igdbId)};`,
        igdbGamesResponseSchema,
      );
      return g ? toGame(g) : null;
    },

    async getGames(igdbIds) {
      const ids = [...new Set(igdbIds)];
      const out: Game[] = [];
      for (let i = 0; i < ids.length; i += IGDB_MAX_LIMIT) {
        const batch = ids.slice(i, i + IGDB_MAX_LIMIT);
        const rows = await query(
          'games',
          `fields ${GAME_FIELDS}; where id = (${idList(batch)}); limit ${IGDB_MAX_LIMIT};`,
          igdbGamesResponseSchema,
        );
        out.push(...rows.map(toGame));
      }
      return out;
    },

    async queryByTags({ genres, themes, minRatingCount, limit }) {
      const tags: string[] = [];
      if (genres.length > 0) tags.push(`genres = (${idList(genres)})`);
      if (themes.length > 0) tags.push(`themes = (${idList(themes)})`);
      if (tags.length === 0) return [];
      const rows = await query(
        'games',
        `fields ${GAME_FIELDS}; where (${tags.join(' | ')}) & total_rating_count >= ${Math.trunc(minRatingCount)} & game_type = 0; ` +
          `sort total_rating desc; limit ${Math.min(Math.max(Math.trunc(limit), 1), IGDB_MAX_LIMIT)};`,
        igdbGamesResponseSchema,
      );
      return rows.map(toGame);
    },

    async keywordNames(ids) {
      const unique = [...new Set(ids)];
      const out: Record<number, string> = {};
      for (let i = 0; i < unique.length; i += IGDB_MAX_LIMIT) {
        const batch = unique.slice(i, i + IGDB_MAX_LIMIT);
        const rows = await query(
          'keywords',
          `fields id,name; where id = (${idList(batch)}); limit ${IGDB_MAX_LIMIT};`,
          igdbKeywordsResponseSchema,
        );
        for (const r of rows) out[r.id] = r.name;
      }
      return out;
    },

    async steamAppIds(appids) {
      const unique = [...new Set(appids)];
      const out = new Map<number, number>();
      for (let i = 0; i < unique.length; i += IGDB_MAX_LIMIT) {
        const batch = unique.slice(i, i + IGDB_MAX_LIMIT);
        const uids = batch.map((a) => `"${Math.trunc(a)}"`).join(',');
        const rows = await query(
          'external_games',
          `fields uid,game; where external_game_source = ${STEAM_SOURCE_ID} & uid = (${uids}) & game != null; limit ${IGDB_MAX_LIMIT};`,
          igdbExternalGamesResponseSchema,
        );
        for (const r of rows) {
          // An appid can have several IGDB entries (bundles, DLC): the first one wins.
          if (r.game !== undefined && !out.has(Number(r.uid))) out.set(Number(r.uid), r.game);
        }
      }
      return out;
    },

    async getTimeToBeat(igdbId) {
      const [t] = await query(
        'game_time_to_beats',
        `fields hastily,normally,completely,count; where game_id = ${Math.trunc(igdbId)};`,
        igdbTimeToBeatResponseSchema,
      );
      if (!t) return null;
      return {
        hastilySeconds: t.hastily ?? null,
        normallySeconds: t.normally ?? null,
        completelySeconds: t.completely ?? null,
        count: t.count ?? null,
      };
    },
  };
}

/** Reads IGDB_CLIENT_ID / IGDB_CLIENT_SECRET from the environment. */
export function createIgdbClientFromEnv(env: NodeJS.ProcessEnv = process.env): IgdbClient {
  const { IGDB_CLIENT_ID: clientId, IGDB_CLIENT_SECRET: clientSecret } = env;
  if (!clientId || !clientSecret) throw new Error('IGDB_CLIENT_ID / IGDB_CLIENT_SECRET not set');
  return createIgdbClient({ clientId, clientSecret });
}
