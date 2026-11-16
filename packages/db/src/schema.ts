import { sql } from 'drizzle-orm';
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

// ---- Users (other auth tables are added with better-auth) ----

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  image: text('image'),
  /** Feature gate: 'free' | 'pro'. Pro is a flag flip once billing ships. */
  plan: text('plan').default('free').notNull(),
  createdAt: ts('created_at').defaultNow().notNull(),
  updatedAt: ts('updated_at')
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

// ---- Shared caches (not user-owned; filled from IGDB / Steam / Deck) ----

export const games = pgTable(
  'games',
  {
    igdbId: integer('igdb_id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    coverUrl: text('cover_url'),
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
    /** 'playing' | 'finished' | 'dropped' | 'backlog' */
    status: text('status').notNull().default('backlog'),
    owned: boolean('owned').default(true).notNull(),
    /** 'manual' | 'import' (platform sync sources join later) */
    source: text('source').notNull().default('manual'),
    addedAt: ts('added_at').defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('library_entries_user_game_platform_idx').on(t.userId, t.igdbId, t.platform),
    index('library_entries_user_status_idx').on(t.userId, t.status),
    check(
      'library_entries_status_chk',
      sql`${t.status} in ('playing', 'finished', 'dropped', 'backlog')`,
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
    at: ts('at').defaultNow().notNull(),
  },
  (t) => [
    index('feedback_user_game_idx').on(t.userId, t.igdbId),
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

export const recommendationCache = pgTable(
  'recommendation_cache',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Null = recommendations not tied to a device. */
    deviceId: uuid('device_id').references(() => devices.id, { onDelete: 'cascade' }),
    items: jsonb('items').notNull().default([]),
    reasons: jsonb('reasons').notNull().default({}),
    builtAt: ts('built_at').defaultNow().notNull(),
  },
  (t) => [
    index('recommendation_cache_user_idx').on(t.userId),
    // One cache row per (user, device), and one for the device-less case.
    uniqueIndex('recommendation_cache_user_device_idx')
      .on(t.userId, t.deviceId)
      .where(sql`${t.deviceId} is not null`),
    uniqueIndex('recommendation_cache_user_nodevice_idx')
      .on(t.userId)
      .where(sql`${t.deviceId} is null`),
  ],
);
