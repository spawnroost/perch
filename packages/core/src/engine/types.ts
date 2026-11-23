import type { Game } from '../igdb/schemas.js';
import type { Status } from '../library/fields.js';

/** Taste vocabulary weights: { vocabId: 0-1 }. */
export type Vocab = Record<string, number>;

/** The slice of a game the engine reads, plus its computed taste vocab. */
export type EngineGame = Pick<
  Game,
  | 'igdbId'
  | 'name'
  | 'firstRelease'
  | 'genres'
  | 'themes'
  | 'similarIds'
  | 'series'
  | 'rating'
  | 'ratingCount'
> & {
  vocab: Vocab;
  /** IGDB platform ids; needed by device filters (missing = plays nowhere). */
  platforms?: number[];
  steamAppId?: number | null;
  /** Cover and IGDB `game_type`, read by the quality floor (absent on library-loaded games). */
  coverUrl?: string | null;
  gameType?: number | null;
  /** IGDB slug and keyword ids, read by `isFreeToPlay` (absent on some library-loaded games). */
  slug?: string;
  keywords?: number[];
};

/** What IGDB (or the cache) returns before vocab is computed. */
export type RawGame = Omit<EngineGame, 'vocab'>;

export interface LibraryItem {
  game: EngineGame;
  hours: number | null;
  lastPlayed: Date | null;
  status: Status;
  owned: boolean;
  /** Personal 1-5 rating; absent or null = unrated. */
  rating?: number | null;
  /** Library platform ('pc', 'ps5', ...); absent when unknown. */
  platform?: string;
}

export type FeedbackKind = 'up' | 'down' | 'played' | 'not_interested';

export interface FeedbackItem {
  igdbId: number;
  kind: FeedbackKind;
}

export interface WeightedGame {
  igdbId: number;
  weight: number;
}

export interface TasteProfile {
  /** Each list is normalised to 0-1 (strongest = 1) and trimmed to the top 15. */
  vocab: Vocab;
  /** IGDB genre id -> weight. */
  genres: Record<number, number>;
  /** IGDB theme id -> weight. */
  themes: Record<number, number>;
  /** Library games by weight, highest first. */
  weights: WeightedGame[];
}

export interface Candidate {
  game: EngineGame;
  backlog: boolean;
}

export interface Recommendation {
  rank: number;
  game: EngineGame;
  score: number;
  backlog: boolean;
  reason: string;
  /** The library game this pick is closest to (the source of the reason); null when none. */
  sourceGame: { igdbId: number; name: string } | null;
  /** Labels this pick shares with `sourceGame`, strongest first; set only when the caller gave labels. */
  sharedTags?: string[];
  /** Set only when devices were given. */
  fit?: { status: 'green' | 'yellow' | 'unknown'; deviceId: string };
}
