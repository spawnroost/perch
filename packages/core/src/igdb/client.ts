import type { z } from 'zod';
import { RateQueue } from './queue.js';
import {
  igdbGamesResponseSchema,
  igdbSearchResponseSchema,
  igdbTimeToBeatResponseSchema,
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
  'cover.image_id',
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

export interface IgdbClient {
  searchGames(name: string): Promise<SearchResult>;
  getGame(igdbId: number): Promise<Game | null>;
  getTimeToBeat(igdbId: number): Promise<TimeToBeat | null>;
}

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
        `search "${q}"; fields name,slug,total_rating_count,first_release_date; limit 20;`,
        igdbSearchResponseSchema,
      );
      const candidates = rows
        .map((r): GameCandidate => ({
          igdbId: r.id,
          name: r.name,
          slug: r.slug ?? null,
          ratingCount: r.total_rating_count ?? 0,
          firstRelease: r.first_release_date ? new Date(r.first_release_date * 1000) : null,
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
      if (!g) return null;
      const steam = g.external_games?.find(
        (e) => e.external_game_source === STEAM_SOURCE_ID && e.uid && /^\d+$/.test(e.uid),
      );
      return {
        igdbId: g.id,
        name: g.name,
        slug: g.slug,
        coverUrl: g.cover
          ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${g.cover.image_id}.jpg`
          : null,
        firstRelease: g.first_release_date ? new Date(g.first_release_date * 1000) : null,
        genres: g.genres ?? [],
        themes: g.themes ?? [],
        keywords: g.keywords ?? [],
        perspectives: g.player_perspectives ?? [],
        gameModes: g.game_modes ?? [],
        platforms: g.platforms ?? [],
        similarIds: g.similar_games ?? [],
        rating: g.total_rating ?? null,
        ratingCount: g.total_rating_count ?? null,
        steamAppId: steam?.uid ? Number(steam.uid) : null,
      };
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
