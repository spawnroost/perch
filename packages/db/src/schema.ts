import { sql } from 'drizzle-orm';
import { STORE_IDS, type StoreId, type StoreLink } from './stores.js';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const ts = (name: string) => timestamp(name, { withTimezone: true });
const intArray = (name: string) =>
  integer(name)
    .array()
    .notNull()
    .default(sql`'{}'::integer[]`);

// ---- Users + better-auth tables (plural names; auth uses drizzleAdapter usePlural) ----

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  image: text('image'),
  /** SteamID64 once the user signs in with / links Steam; unique across users. */
  steamId: text('steam_id').unique(),
  /** Feature gate: 'free' | 'pro'. Pro is a flag flip once billing ships. */
  plan: text('plan').default('free').notNull(),
  /** Bumped by every write that feeds the recommendations; the cache only serves its own version. */
  recsVersion: integer('recs_version').default(0).notNull(),
  /** When the Steam library was last imported; null until the first sync. */
  steamSyncedAt: ts('steam_synced_at'),
  /** Xbox account (xuid) linked by gamertag; cached so a resync costs one OpenXBL request. */
  xboxXuid: text('xbox_xuid'),
  xboxGamertag: text('xbox_gamertag'),
  /** When the Xbox title history was last imported; null until the first sync. */
  xboxSyncedAt: ts('xbox_synced_at'),
  /** PlayStation account linked by online ID; cached so a resync skips the profile lookup. */
  psnAccountId: text('psn_account_id'),
  psnOnlineId: text('psn_online_id'),
  /** When the PlayStation played-games list was last imported; null until the first sync. */
  psnSyncedAt: ts('psn_synced_at'),
  createdAt: ts('created_at').defaultNow().notNull(),
  updatedAt: ts('updated_at')
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    expiresAt: ts('expires_at').notNull(),
    token: text('token').notNull().unique(),
    createdAt: ts('created_at').defaultNow().notNull(),
    updatedAt: ts('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (t) => [index('sessions_user_id_idx').on(t.userId)],
);

export const accounts = pgTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: ts('access_token_expires_at'),
    refreshTokenExpiresAt: ts('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: ts('created_at').defaultNow().notNull(),
    updatedAt: ts('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index('accounts_user_id_idx').on(t.userId),
    uniqueIndex('accounts_user_provider_uniq').on(t.userId, t.providerId),
  ],
);

export const verifications = pgTable(
  'verifications',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: ts('expires_at').notNull(),
    createdAt: ts('created_at').defaultNow().notNull(),
    updatedAt: ts('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index('verifications_identifier_idx').on(t.identifier)],
);

// ---- Shared caches (not user-owned; filled from IGDB / Steam / Deck) ----

export { STORE_IDS, type StoreId, type StoreLink };

/** Co-op / split-screen modes; core's `multiplayerSchema` is checked against this shape. */
export interface Multiplayer {
  campaign: boolean;
  online: boolean;
  onlineMax: number | null;
  local: boolean;
  splitscreen: boolean;
}

export const games = pgTable(
  'games',
  {
    igdbId: integer('igdb_id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    coverUrl: text('cover_url'),
    coverUrlSmall: text('cover_url_small'),
    /** First IGDB artwork, else first screenshot (t_1080p). */
    heroUrl: text('hero_url'),
    /** Dominant cover colour as #rrggbb; null when not computed or the cover has no colour. */
    accent: text('accent'),
    /** The cover_url_small the accent was computed from (set even when no colour was found). */
    accentSource: text('accent_source'),
    /** When hero/cover art was last fetched from IGDB; null on rows cached before art existed. */
    artCheckedAt: ts('art_checked_at'),
    /** IGDB summary; null until fetched with a client that asks for it. */
    summary: text('summary'),
    firstRelease: ts('first_release'),
    genres: intArray('genres'),
    themes: intArray('themes'),
    keywords: intArray('keywords'),
    perspectives: intArray('perspectives'),
    gameModes: intArray('game_modes'),
    /** IGDB platform ids. */
    platforms: intArray('platforms'),
    similarIds: intArray('similar_ids'),
    /** Series ids: IGDB collections, plus franchises offset by 1_000_000. */
    series: intArray('series'),
    rating: real('rating'),
    ratingCount: integer('rating_count'),
    steamAppId: integer('steam_app_id'),
    /** IGDB `aggregated_rating` (critic average, 0-100) and its review count. */
    criticRating: real('critic_rating'),
    criticRatingCount: integer('critic_rating_count'),
    /** Store links from IGDB websites: [{ store, url }]. */
    websites: jsonb('websites').$type<StoreLink[]>().notNull().default([]),
    /** Studios from IGDB involved_companies. */
    developers: jsonb('developers').$type<string[]>().notNull().default([]),
    publishers: jsonb('publishers').$type<string[]>().notNull().default([]),
    /** Merged multiplayer modes; null when IGDB lists none. */
    multiplayer: jsonb('multiplayer').$type<Multiplayer>(),
    dlcCount: integer('dlc_count').notNull().default(0),
    expansionCount: integer('expansion_count').notNull().default(0),
    seriesName: text('series_name'),
    /** When the About fields were last fetched; null = never (backfill target). */
    aboutFetchedAt: ts('about_fetched_at'),
    /** Steam user-review summary; desc/pct/total are null when the app has no reviews. */
    steamReviewDesc: text('steam_review_desc'),
    steamReviewPct: integer('steam_review_pct'),
    steamReviewTotal: integer('steam_review_total'),
    /** When the Steam summary was last asked for; null = never. */
    steamReviewFetchedAt: ts('steam_review_fetched_at'),
    /** Taste vocabulary: { vocabId: weight }. */
    vocab: jsonb('vocab').$type<Record<string, number>>().notNull().default({}),
    fetchedAt: ts('fetched_at').defaultNow().notNull(),
  },
  (t) => [index('games_steam_app_id_idx').on(t.steamAppId), index('games_slug_idx').on(t.slug)],
);

export const gameRequirements = pgTable(
  'game_requirements',
  {
    igdbId: integer('igdb_id')
      .notNull()
      .references(() => games.igdbId, { onDelete: 'cascade' }),
    /** 'steam' | 'pcgw' | 'llm' */
    source: text('source').notNull(),
    minGpuScore: integer('min_gpu_score'),
    minCpuScore: integer('min_cpu_score'),
    minRamGb: real('min_ram_gb'),
    recGpuScore: integer('rec_gpu_score'),
    recCpuScore: integer('rec_cpu_score'),
    recRamGb: real('rec_ram_gb'),
    raw: text('raw'),
    parsedAt: ts('parsed_at').defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.igdbId, t.source] }),
    check('game_requirements_source_chk', sql`${t.source} in ('steam', 'pcgw', 'llm')`),
  ],
);

export const deckCompat = pgTable(
  'deck_compat',
  {
    steamAppId: integer('steam_app_id').primaryKey(),
    /** 'verified' | 'playable' | 'unsupported' | 'unknown' */
    category: text('category').notNull(),
    checkedAt: ts('checked_at').defaultNow().notNull(),
  },
  (t) => [
    check(
      'deck_compat_category_chk',
      sql`${t.category} in ('verified', 'playable', 'unsupported', 'unknown')`,
    ),
  ],
);

/** IGDB game_time_to_beats, in seconds. Use only as a relative signal; ignore if count < 5. */
export const timeToBeat = pgTable('time_to_beat', {
  igdbId: integer('igdb_id')
    .primaryKey()
    .references(() => games.igdbId, { onDelete: 'cascade' }),
  hastilySeconds: integer('hastily_seconds'),
  normallySeconds: integer('normally_seconds'),
  completelySeconds: integer('completely_seconds'),
  count: integer('count'),
  checkedAt: ts('checked_at').defaultNow().notNull(),
});

// ---- User-owned tables (all cascade on user deletion) ----

export const devices = pgTable(
  'devices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Preset id (e.g. 'steam-deck') or 'pc'. */
    kind: text('kind').notNull(),
    name: text('name').notNull(),
    /** IGDB platform ids this device can play. */
    platformIds: intArray('platform_ids'),
    gpuName: text('gpu_name'),
    gpuScore: integer('gpu_score'),
    cpuName: text('cpu_name'),
    cpuScore: integer('cpu_score'),
    ramGb: real('ram_gb'),
    isDefault: boolean('is_default').default(false).notNull(),
    createdAt: ts('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('devices_user_idx').on(t.userId),
    // At most one default device per user.
    uniqueIndex('devices_one_default_idx')
      .on(t.userId)
      .where(sql`${t.isDefault}`),
  ],
);

/**
 * Steam appid -> IGDB game. A hit is kept for good; a miss (igdbId null) is looked up again
 * once it is older than the retry window.
 */
export const steamAppMap = pgTable('steam_app_map', {
  appid: integer('appid').primaryKey(),
  igdbId: integer('igdb_id'),
  checkedAt: ts('checked_at').defaultNow().notNull(),
});

export const libraryEntries = pgTable(
  'library_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    igdbId: integer('igdb_id')
      .notNull()
      .references(() => games.igdbId, { onDelete: 'cascade' }),
    /** 'pc' | 'ps5' | 'switch' | ... */
    platform: text('platform').notNull(),
    hoursPlayed: real('hours_played'),
    lastPlayed: ts('last_played'),
    /** 'playing' | 'finished' | 'dropped' | 'backlog' | 'paused' */
    status: text('status').notNull().default('backlog'),
    owned: boolean('owned').default(true).notNull(),
    /** An import found real, older playtime: ask the user whether it is paused. Cleared on any status choice. */
    playedBeforePending: boolean('played_before_pending').default(false).notNull(),
    /** 'manual' | 'import' | 'steam' | 'xbox' | 'psn' */
    source: text('source').notNull().default('manual'),
    addedAt: ts('added_at').defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('library_entries_user_game_platform_idx').on(t.userId, t.igdbId, t.platform),
    index('library_entries_user_status_idx').on(t.userId, t.status),
    check(
      'library_entries_status_chk',
      sql`${t.status} in ('playing', 'finished', 'dropped', 'backlog', 'paused')`,
    ),
  ],
);

export const feedback = pgTable(
  'feedback',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    igdbId: integer('igdb_id')
      .notNull()
      .references(() => games.igdbId, { onDelete: 'cascade' }),
    /** 'up' | 'down' | 'played' | 'not_interested' */
    kind: text('kind').notNull(),
    /** Up and down are one vote ('vote'); each flag is its own slot. Keys the upsert. */
    slot: text('slot').generatedAlwaysAs(
      sql`case when kind in ('up', 'down') then 'vote' else kind end`,
    ),
    at: ts('at').defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('feedback_user_game_slot_idx').on(t.userId, t.igdbId, t.slot),
    check('feedback_kind_chk', sql`${t.kind} in ('up', 'down', 'played', 'not_interested')`),
  ],
);

/** Cached; rebuilt when the library or feedback changes. One row per user. */
export const tasteProfiles = pgTable('taste_profiles', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  vocab: jsonb('vocab').$type<Record<string, number>>().notNull().default({}),
  genres: jsonb('genres').$type<Record<string, number>>().notNull().default({}),
  pacing: text('pacing'),
  builtAt: ts('built_at').defaultNow().notNull(),
});

/**
 * Per-user cached API responses for For you, one row per normalised request (device + limit).
 * Only served while `version` equals the user's `recs_version`.
 */
export const recommendationCache = pgTable(
  'recommendation_cache',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    /** The JSON response body (dates are already ISO strings). */
    payload: jsonb('payload').notNull(),
    /** users.recs_version the payload was computed from (read before computing). */
    version: integer('version').default(0).notNull(),
    computedAt: ts('computed_at').defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
);
