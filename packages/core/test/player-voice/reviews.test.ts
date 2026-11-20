import { describe, expect, it } from 'vitest';
import { createSteamClient, SteamError } from '../../src/requirements/index.js';
import {
  MIN_VOICE_REVIEWS,
  parseReviewTexts,
  pickReviews,
  VOICE_MAX_REVIEWS,
  VOICE_REVIEW_MAX_CHARS,
} from '../../src/player-voice/index.js';

const long = (n: number, c = 'a') => c.repeat(n);
const raw = (over: Record<string, unknown> = {}) => ({
  review: long(60),
  voted_up: true,
  votes_up: 1,
  author: { playtime_at_review: 120 },
  primarily_steam_deck: false,
  ...over,
});

describe('pickReviews', () => {
  it('skips texts under 40 characters, trimmed', () => {
    const out = pickReviews([
      raw({ review: long(39) }),
      raw({ review: `   ${long(39)}   ` }),
      raw({ review: long(40) }),
    ]);
    expect(out).toHaveLength(1);
  });

  it('takes the most helpful 50, most votes first', () => {
    const reviews = Array.from({ length: 80 }, (_, i) =>
      raw({ review: `r${i} ${long(50)}`, votes_up: i }),
    );
    const out = pickReviews(reviews);
    expect(out).toHaveLength(VOICE_MAX_REVIEWS);
    expect(out[0]!.text.startsWith('r79 ')).toBe(true);
    expect(out[49]!.text.startsWith('r30 ')).toBe(true);
  });

  it('cuts each text to 600 characters', () => {
    const out = pickReviews([raw({ review: long(2000) })]);
    expect(out[0]!.text).toHaveLength(VOICE_REVIEW_MAX_CHARS);
  });

  it('keeps vote, playtime and Deck flag, with defaults for missing fields', () => {
    const out = pickReviews([
      raw({ voted_up: false, author: { playtime_at_review: 90 }, primarily_steam_deck: true }),
      raw({ author: {}, primarily_steam_deck: undefined, votes_up: 0 }),
    ]);
    expect(out[0]).toMatchObject({ votedUp: false, playtimeMinutes: 90, deck: true });
    expect(out[1]).toMatchObject({ votedUp: true, playtimeMinutes: null, deck: false });
  });

  it('ignores malformed entries', () => {
    const out = pickReviews([null, 'x', { review: 5 }, raw()] as unknown[]);
    expect(out).toHaveLength(1);
  });

  it('needs at least 10 usable reviews to summarize', () => {
    expect(MIN_VOICE_REVIEWS).toBe(10);
  });
});

describe('parseReviewTexts', () => {
  it('reads the reviews of a successful body', () => {
    expect(parseReviewTexts({ success: 1, reviews: [raw()] })).toHaveLength(1);
  });
  it('is empty only when Steam succeeds with no reviews', () => {
    expect(parseReviewTexts({ success: 1, reviews: [] })).toEqual([]);
  });
  it('throws when success is not 1 or missing', () => {
    expect(() => parseReviewTexts({ success: 0 })).toThrow();
    expect(() => parseReviewTexts({ success: 2, reviews: [] })).toThrow();
    expect(() => parseReviewTexts({ reviews: [] })).toThrow();
  });
  it('throws on an unreadable body', () => {
    expect(() => parseReviewTexts('nope')).toThrow();
    expect(() => parseReviewTexts({ success: 1 })).toThrow();
  });
});

describe('steam client getReviewTexts', () => {
  const client = (res: () => Response, urls: string[] = []) =>
    createSteamClient({
      fetch: (async (u: string) => {
        urls.push(String(u));
        return res();
      }) as unknown as typeof fetch,
      sleep: async () => {},
      maxRetries: 0,
    });

  it('asks for 100 English reviews and returns the picked ones', async () => {
    const urls: string[] = [];
    const c = client(() => new Response(JSON.stringify({ success: 1, reviews: [raw()] })), urls);
    expect(await c.getReviewTexts(1145360)).toHaveLength(1);
    expect(urls[0]).toContain('/appreviews/1145360?');
    expect(urls[0]).toContain('language=english');
    expect(urls[0]).toContain('num_per_page=100');
  });

  it('throws a SteamError on a non-JSON answer (a redirect to the store page)', async () => {
    const c = client(() => new Response('<html></html>'));
    await expect(c.getReviewTexts(1)).rejects.toBeInstanceOf(SteamError);
  });
});
