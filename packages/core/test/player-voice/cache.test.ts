import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDb, gamePlayerVoice, games, llmUsage, runMigrations, type Db } from '@perch/db';
import type { SteamClient } from '../../src/requirements/index.js';
import {
  clearPlayerVoiceBlocks,
  playerVoiceIdle,
  playerVoiceLookup,
  PLAYER_VOICE_BLOCK_MS,
  PLAYER_VOICE_NEGATIVE_TTL_MS,
  PLAYER_VOICE_TTL_MS,
  type PlayerVoice,
  type VoiceReview,
  type VoiceSummarizer,
} from '../../src/player-voice/index.js';

const url = process.env.DATABASE_URL_TEST;
const ID = 987_654_411;
const T0 = new Date('2026-06-01T00:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const at = (ms: number) => () => new Date(+T0 + ms);
const voice: PlayerVoice = { likes: ['Tight combat'], complaints: ['Short'], deck: null };
const reviews = (n: number): VoiceReview[] =>
  Array.from({ length: n }, (_, i) => ({
    text: `review number ${i} with enough text to count`,
    votedUp: true,
    playtimeMinutes: 60,
    deck: false,
  }));
const game = { igdbId: ID, name: 'Voice Test', steamAppId: 4242 };

describe.skipIf(!url)('playerVoiceLookup', () => {
  let db: Db;
  beforeAll(async () => {
    await runMigrations(url!);
    db = createDb(url!);
  });
  afterAll(async () => {
    await db.delete(games).where(eq(games.igdbId, ID));
    await db.delete(llmUsage);
    await db?.$client.end({ timeout: 1 });
  });
  beforeEach(async () => {
    await db.delete(games).where(eq(games.igdbId, ID));
    await db.insert(games).values({ igdbId: ID, name: 'Voice Test', slug: 'voice-test' });
    await db.delete(llmUsage);
    clearPlayerVoiceBlocks();
  });

  function fakes(
    o: { reviews?: () => Promise<VoiceReview[]>; voice?: () => Promise<PlayerVoice | null> } = {},
  ) {
    const steamCalls: number[] = [];
    const llmCalls: string[] = [];
    const client = {
      async getReviewTexts(id: number) {
        steamCalls.push(id);
        return (o.reviews ?? (async () => reviews(20)))();
      },
    } as unknown as SteamClient;
    const summarizer: VoiceSummarizer = {
      async summarize(title) {
        llmCalls.push(title);
        return (o.voice ?? (async () => voice))();
      },
    };
    return { client, summarizer, steamCalls, llmCalls };
  }
  const opts = (f: ReturnType<typeof fakes>, ms = 0, extra = {}) => ({
    client: f.client,
    summarizer: f.summarizer,
    now: at(ms),
    ...extra,
  });
  const stored = async () =>
    (await db.select().from(gamePlayerVoice).where(eq(gamePlayerVoice.igdbId, ID)))[0];

  it('fetches, summarizes and stores; a fresh row is served without calls', async () => {
    const f = fakes();
    expect(await playerVoiceLookup(db, game, 'u1', opts(f))).toEqual({ voice, pending: false });
    expect((await stored())!.reviewCount).toBe(20);
    expect(await playerVoiceLookup(db, game, 'u1', opts(f, 29 * DAY))).toEqual({
      voice,
      pending: false,
    });
    expect(f.steamCalls).toEqual([4242]);
    expect(f.llmCalls).toEqual(['Voice Test']);
  });

  it('serves a stale summary at once and refreshes it in the background', async () => {
    const f = fakes();
    await playerVoiceLookup(db, game, 'u1', opts(f));
    const newer: PlayerVoice = { likes: ['New'], complaints: [], deck: 'Runs fine' };
    const g = fakes({ voice: async () => newer });
    const r = await playerVoiceLookup(db, game, 'u1', opts(g, PLAYER_VOICE_TTL_MS + DAY));
    expect(r).toEqual({ voice, pending: false });
    await playerVoiceIdle();
    expect((await stored())!.payload).toEqual(newer);
  });

  it('negative-caches too few reviews for 7 days without spending the LLM', async () => {
    const f = fakes({ reviews: async () => reviews(9) });
    expect(await playerVoiceLookup(db, game, 'u1', opts(f))).toEqual({
      voice: null,
      pending: false,
    });
    expect(f.llmCalls).toEqual([]);
    expect(await stored()).toMatchObject({ payload: null, reviewCount: 9 });
    await playerVoiceLookup(db, game, 'u1', opts(f, 6 * DAY));
    expect(f.steamCalls).toHaveLength(1);
    await playerVoiceLookup(db, game, 'u1', opts(f, PLAYER_VOICE_NEGATIVE_TTL_MS + DAY));
    await playerVoiceIdle();
    expect(f.steamCalls).toHaveLength(2);
  });

  it('negative-caches a summary with nothing in it', async () => {
    const f = fakes({ voice: async () => null });
    expect(await playerVoiceLookup(db, game, 'u1', opts(f))).toEqual({
      voice: null,
      pending: false,
    });
    expect(await stored()).toMatchObject({ payload: null, reviewCount: 20 });
  });

  it('does nothing for a game without a Steam app', async () => {
    const f = fakes();
    const r = await playerVoiceLookup(db, { ...game, steamAppId: null }, 'u1', opts(f));
    expect(r).toEqual({ voice: null, pending: false });
    expect(f.steamCalls).toEqual([]);
    expect(await stored()).toBeUndefined();
  });

  it('does nothing without a summarizer', async () => {
    const f = fakes();
    const r = await playerVoiceLookup(db, game, 'u1', {
      client: f.client,
      summarizer: null,
      now: at(0),
    });
    expect(r).toEqual({ voice: null, pending: false });
    expect(f.steamCalls).toEqual([]);
  });

  it('spends the daily LLM allowance; a used-up cap stores nothing and blocks for 10 minutes', async () => {
    const f = fakes();
    const capped = { globalCap: 0 };
    expect(await playerVoiceLookup(db, game, 'u1', opts(f, 0, capped))).toEqual({
      voice: null,
      pending: false,
    });
    expect(f.llmCalls).toEqual([]);
    expect(await stored()).toBeUndefined();
    // Blocked: a later visit does not even fetch from Steam again.
    await playerVoiceLookup(db, game, 'u1', opts(f, 60_000));
    expect(f.steamCalls).toHaveLength(1);
    // After the block the lookup tries again, now with allowance.
    const r = await playerVoiceLookup(db, game, 'u1', opts(f, PLAYER_VOICE_BLOCK_MS + 1000));
    expect(r.voice).toEqual(voice);
  });

  it('counts one batch against the user', async () => {
    const f = fakes();
    await playerVoiceLookup(db, game, 'u9', opts(f));
    const rows = await db.select().from(llmUsage).where(eq(llmUsage.key, 'user:u9'));
    expect(rows[0]!.count).toBe(1);
  });

  it('keeps the stored summary and blocks 10 minutes when a refresh fails', async () => {
    await playerVoiceLookup(db, game, 'u1', opts(fakes()));
    const bad = fakes({ reviews: async () => Promise.reject(new Error('steam down')) });
    const later = PLAYER_VOICE_TTL_MS + DAY;
    expect((await playerVoiceLookup(db, game, 'u1', opts(bad, later))).voice).toEqual(voice);
    await playerVoiceIdle();
    expect((await stored())!.payload).toEqual(voice);
    await playerVoiceLookup(db, game, 'u1', opts(bad, later + 60_000));
    await playerVoiceIdle();
    expect(bad.steamCalls).toHaveLength(1);
    await playerVoiceLookup(db, game, 'u1', opts(bad, later + PLAYER_VOICE_BLOCK_MS + 1000));
    await playerVoiceIdle();
    expect(bad.steamCalls).toHaveLength(2);
  });

  it('answers null without storing when the first fetch fails', async () => {
    const bad = fakes({ voice: async () => Promise.reject(new Error('llm down')) });
    expect(await playerVoiceLookup(db, game, 'u1', opts(bad))).toEqual({
      voice: null,
      pending: false,
    });
    expect(await stored()).toBeUndefined();
  });

  it('shares one lookup between overlapping calls and reports pending after the wait', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const f = fakes({
      voice: async () => {
        await gate;
        return voice;
      },
    });
    const a = playerVoiceLookup(db, game, 'u1', opts(f, 0, { waitMs: 20 }));
    const b = playerVoiceLookup(db, game, 'u2', opts(f, 0, { waitMs: 20 }));
    expect(await a).toEqual({ voice: null, pending: true });
    expect(await b).toEqual({ voice: null, pending: true });
    release();
    await playerVoiceIdle();
    expect(f.steamCalls).toHaveLength(1);
    expect(await playerVoiceLookup(db, game, 'u1', opts(f))).toEqual({ voice, pending: false });
  });
});
