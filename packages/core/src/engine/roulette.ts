import {
  rankForSession,
  type SessionDevice,
  type SessionRanked,
  type SessionRec,
} from './session.js';

/** Moods the roulette can be nudged with. */
export const MOODS = ['chill', 'intense', 'story', 'quick'] as const;
export type Mood = (typeof MOODS)[number];

/** How many of the best-ranked backlog games are in the draw. */
export const ROULETTE_POOL = 10;
/** A tag counts toward a mood from this weight up (vocab weights run 0-1). */
const MIN_TAG_WEIGHT = 0.3;
/** Longest time to beat, in hours, that still counts as "quick". */
export const QUICK_MAX_HOURS = 8;

/** Taste-vocab tags behind each tag-based mood. */
const MOOD_TAGS: Record<Exclude<Mood, 'quick'>, readonly string[]> = {
  chill: ['relaxed', 'cozy', 'wholesome', 'whimsical', 'sandbox'],
  intense: ['fast-paced', 'high-tension', 'challenging', 'horror', 'shooter', 'competitive'],
  story: ['story-rich', 'emotional', 'mystery', 'slow-burn'],
};
/** Tags of games played in short runs; "quick" falls back to these when time-to-beat is unknown. */
const QUICK_TAGS = ['roguelike', 'puzzle', 'platformer'] as const;

export type RouletteGame = SessionRec;

export type Relaxed = 'mood' | 'exclude';

export interface RouletteInput<T extends RouletteGame> {
  /** The user's backlog games. */
  games: readonly T[];
  device?: SessionDevice | null;
  minutes?: number;
  mood?: Mood;
  /** Game ids not to pick (the last few spins). */
  exclude?: readonly number[];
  /** Uniform in [0, 1); injectable for tests. */
  rng?: () => number;
}

export interface RoulettePick<T extends RouletteGame> {
  pick: SessionRanked<T>;
  /** Which filter was dropped to find a game; null when none was. */
  relaxed: Relaxed | null;
}

const hasTag = (g: RouletteGame, tags: readonly string[]) =>
  tags.some((t) => (g.game.vocab[t] ?? 0) >= MIN_TAG_WEIGHT);

/** Whether a game suits a mood. "Quick" is a short time to beat, else short-run tags. */
export function matchesMood(g: RouletteGame, mood: Mood): boolean {
  if (mood !== 'quick') return hasTag(g, MOOD_TAGS[mood]);
  const hours = [g.timeToBeat?.normallyHours, g.timeToBeat?.hastilyHours].find(
    (h) => h != null && h > 0,
  );
  return hours != null ? hours <= QUICK_MAX_HOURS : hasTag(g, QUICK_TAGS);
}

function rankPool<T extends RouletteGame>(
  games: readonly T[],
  { device, minutes }: Pick<RouletteInput<T>, 'device' | 'minutes'>,
): SessionRanked<T>[] {
  if (minutes !== undefined) return rankForSession(games, { minutes, device: device ?? null });
  return [...games]
    .sort((a, b) => b.score - a.score || a.rank - b.rank)
    .map((g, i) => ({ ...g, rank: i + 1, sessionReason: 'Waiting in your backlog' }));
}

/** Weighted draw over the pool, best first: weights n, n-1 ... 1. */
function draw<T>(pool: readonly T[], roll: number): T {
  const total = (pool.length * (pool.length + 1)) / 2;
  let left = Math.min(Math.max(roll, 0), 0.999_999_999) * total;
  for (const [i, item] of pool.entries()) {
    left -= pool.length - i;
    if (left < 0) return item;
  }
  return pool[pool.length - 1]!;
}

/**
 * Picks one game to play from the backlog: the games are ranked (for the session when `minutes`
 * is given, else by engine score), and one of the best {@link ROULETTE_POOL} is drawn, better
 * ranks more likely. When the mood leaves nothing the mood is dropped; when the exclusions
 * leave nothing they are dropped too (`relaxed` says which). Null for an empty backlog. Pure.
 */
export function pickFromBacklog<T extends RouletteGame>(
  input: RouletteInput<T>,
): RoulettePick<T> | null {
  const { games, mood, exclude = [], rng = Math.random } = input;
  const skip = new Set(exclude);
  const byMood = (gs: readonly T[]) => (mood ? gs.filter((g) => matchesMood(g, mood)) : gs);
  const fresh = games.filter((g) => !skip.has(g.game.igdbId));
  const moody = byMood(fresh);
  let pool: readonly T[] = moody;
  let relaxed: Relaxed | null = null;
  if (pool.length === 0 && fresh.length > 0) [pool, relaxed] = [fresh, 'mood'];
  if (pool.length === 0) {
    // Everything was picked recently: allow repeats, still preferring the mood.
    const again = byMood(games);
    [pool, relaxed] = [again.length > 0 ? again : games, 'exclude'];
  }
  if (pool.length === 0) return null;
  const top = rankPool(pool, input).slice(0, ROULETTE_POOL);
  return { pick: draw(top, rng()), relaxed };
}
