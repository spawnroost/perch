import { describe, expect, it } from 'vitest';
import {
  MOODS,
  ROULETTE_POOL,
  matchesMood,
  pickFromBacklog,
  type RouletteGame,
} from '../../src/engine/roulette.js';
import type { TimeToBeatHours } from '../../src/igdb/time-to-beat.js';
import { game } from './fixtures.js';

let n = 0;
function rec(over: Partial<RouletteGame> & { vocab?: Record<string, number> } = {}): RouletteGame {
  const { vocab, ...rest } = over;
  n += 1;
  return {
    rank: n,
    game: game(n, `Game ${n}`, vocab ?? {}),
    score: 1,
    backlog: true,
    reason: 'Because you played X',
    sourceGame: null,
    timeToBeat: null,
    fits: [{ deviceId: 'd1', status: 'green' }],
    ...rest,
  };
}
const ttb = (normally: number | null): TimeToBeatHours => ({
  hastilyHours: null,
  normallyHours: normally,
  completelyHours: null,
  submissions: 5,
});
const pc = { id: 'd1', kind: 'pc', gpuScore: 10000 };
const ids = (xs: readonly RouletteGame[]) => xs.map((x) => x.game.igdbId);

describe('matchesMood', () => {
  it('matches a game with a tag of the mood', () => {
    expect(matchesMood(rec({ vocab: { cozy: 0.8 } }), 'chill')).toBe(true);
    expect(matchesMood(rec({ vocab: { horror: 0.8 } }), 'chill')).toBe(false);
    expect(matchesMood(rec({ vocab: { 'high-tension': 0.9 } }), 'intense')).toBe(true);
    expect(matchesMood(rec({ vocab: { 'story-rich': 0.7 } }), 'story')).toBe(true);
  });

  it('ignores a tag that is only faintly there', () => {
    expect(matchesMood(rec({ vocab: { cozy: 0.05 } }), 'chill')).toBe(false);
  });

  it('quick means a short time-to-beat, whatever the tags say', () => {
    expect(matchesMood(rec({ timeToBeat: ttb(4) }), 'quick')).toBe(true);
    expect(matchesMood(rec({ timeToBeat: ttb(60), vocab: { roguelike: 1 } }), 'quick')).toBe(false);
  });

  it('quick falls back to pick-up-and-play tags when time-to-beat is unknown', () => {
    expect(matchesMood(rec({ vocab: { roguelike: 0.8 } }), 'quick')).toBe(true);
    expect(matchesMood(rec({ vocab: { rpg: 0.8 } }), 'quick')).toBe(false);
  });

  it('covers every mood', () => {
    expect([...MOODS]).toEqual(['chill', 'intense', 'story', 'quick']);
  });
});

describe('pickFromBacklog', () => {
  it('returns null for an empty backlog', () => {
    expect(pickFromBacklog({ games: [] })).toBeNull();
  });

  it('only picks from the top of the ranking, never the tail', () => {
    const games = Array.from({ length: ROULETTE_POOL + 5 }, (_, i) => rec({ score: 100 - i }));
    const tail = new Set(ids(games.slice(ROULETTE_POOL)));
    for (const roll of [0, 0.25, 0.5, 0.75, 0.9999]) {
      const out = pickFromBacklog({ games, rng: () => roll });
      expect(tail.has(out!.pick.game.igdbId)).toBe(false);
    }
  });

  it('weights a better rank higher: rng 0 is the best, rng near 1 the worst of the pool', () => {
    const games = [rec({ score: 3 }), rec({ score: 2 }), rec({ score: 1 })];
    const best = pickFromBacklog({ games, rng: () => 0 })!.pick;
    const worst = pickFromBacklog({ games, rng: () => 0.9999 })!.pick;
    expect(best.game.igdbId).toBe(games[0]!.game.igdbId);
    expect(worst.game.igdbId).toBe(games[2]!.game.igdbId);
    // Weights 3:2:1, so 0.5 (3 of 6) still lands on the best and 0.51 on the second.
    expect(pickFromBacklog({ games, rng: () => 0.49 })!.pick.game.igdbId).toBe(
      games[0]!.game.igdbId,
    );
    expect(pickFromBacklog({ games, rng: () => 0.51 })!.pick.game.igdbId).toBe(
      games[1]!.game.igdbId,
    );
  });

  it('is more likely to pick better ranks over many spins', () => {
    const games = [rec({ score: 3 }), rec({ score: 2 }), rec({ score: 1 })];
    const counts = new Map<number, number>();
    for (let i = 0; i < 600; i++) {
      const id = pickFromBacklog({ games, rng: () => (i + 0.5) / 600 })!.pick.game.igdbId;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    expect(counts.get(games[0]!.game.igdbId)).toBe(300);
    expect(counts.get(games[2]!.game.igdbId)).toBe(100);
  });

  it('works without an rng (defaults to Math.random)', () => {
    const games = [rec(), rec()];
    expect(ids(games)).toContain(pickFromBacklog({ games })!.pick.game.igdbId);
  });

  it('skips excluded ids', () => {
    const games = [rec({ score: 3 }), rec({ score: 2 }), rec({ score: 1 })];
    const out = pickFromBacklog({ games, exclude: [games[0]!.game.igdbId], rng: () => 0 })!;
    expect(out.pick.game.igdbId).toBe(games[1]!.game.igdbId);
    expect(out.relaxed).toBeNull();
  });

  it('filters by mood', () => {
    const calm = rec({ vocab: { cozy: 1 }, score: 1 });
    const loud = rec({ vocab: { shooter: 1, 'fast-paced': 1 }, score: 9 });
    const out = pickFromBacklog({ games: [loud, calm], mood: 'chill', rng: () => 0 })!;
    expect(out.pick.game.igdbId).toBe(calm.game.igdbId);
    expect(out.relaxed).toBeNull();
  });

  it('relaxes the mood first when nothing matches it', () => {
    const only = rec({ vocab: { shooter: 1 } });
    const out = pickFromBacklog({ games: [only], mood: 'chill', rng: () => 0 })!;
    expect(out.pick.game.igdbId).toBe(only.game.igdbId);
    expect(out.relaxed).toBe('mood');
  });

  it('keeps the exclusions when relaxing the mood helps', () => {
    const a = rec({ vocab: { shooter: 1 }, score: 3 });
    const b = rec({ vocab: { shooter: 1 }, score: 2 });
    const out = pickFromBacklog({
      games: [a, b],
      mood: 'chill',
      exclude: [a.game.igdbId],
      rng: () => 0,
    })!;
    expect(out.pick.game.igdbId).toBe(b.game.igdbId);
    expect(out.relaxed).toBe('mood');
  });

  it('relaxes the exclusions last, when everything was picked recently', () => {
    const a = rec();
    const b = rec();
    const out = pickFromBacklog({
      games: [a, b],
      exclude: [a.game.igdbId, b.game.igdbId],
      rng: () => 0,
    })!;
    expect(ids([out.pick])).toHaveLength(1);
    expect(out.relaxed).toBe('exclude');
  });

  it('ranks for the session when minutes are given', () => {
    const long = rec({ timeToBeat: ttb(80), score: 1 });
    const short = rec({ timeToBeat: ttb(0.4), score: 1 });
    const out = pickFromBacklog({ games: [long, short], minutes: 30, device: pc, rng: () => 0 })!;
    expect(out.pick.game.igdbId).toBe(short.game.igdbId);
    expect(out.pick.sessionReason).toBe('Beatable now');
  });

  it('without minutes it keeps the engine order and says it is waiting in the backlog', () => {
    const lo = rec({ score: 1 });
    const hi = rec({ score: 5 });
    const out = pickFromBacklog({ games: [lo, hi], rng: () => 0 })!;
    expect(out.pick.game.igdbId).toBe(hi.game.igdbId);
    expect(out.pick.sessionReason).toBe('Waiting in your backlog');
  });

  it('does not mutate its input', () => {
    const games = [rec({ score: 1 }), rec({ score: 2 })];
    const before = ids(games);
    pickFromBacklog({ games, minutes: 30, exclude: [before[0]!], rng: () => 0 });
    expect(ids(games)).toEqual(before);
  });
});

describe('pickFromBacklog relaxing order', () => {
  it('keeps the mood when only the exclusions have to go', () => {
    const calm = rec({ vocab: { cozy: 1 } });
    const loud = rec({ vocab: { shooter: 1 } });
    const out = pickFromBacklog({
      games: [calm, loud],
      mood: 'chill',
      exclude: [calm.game.igdbId, loud.game.igdbId],
      rng: () => 0,
    })!;
    expect(out.pick.game.igdbId).toBe(calm.game.igdbId);
    expect(out.relaxed).toBe('exclude');
  });
});
