import { IGDB_GENRES, IGDB_THEMES } from '../browse/facets.js';
import { STATUSES } from '../library/fields.js';
import type { TasteSummary } from '../schemas/taste-card.js';
import { buildProfile } from './profile.js';
import { mergeLibrary } from './recommend.js';
import type { FeedbackItem, LibraryItem, Vocab } from './types.js';

export const TASTE_TOP_N = 5;
export const COLLAGE_MAX = 9;
/** A tag counts toward the playstyle from this weight up (profile vocab runs 0-1). */
const MIN_STYLE_WEIGHT = 0.3;
/** Shown when no tag is strong enough to name a playstyle. */
export const PLAYSTYLE_FALLBACK = 'Eclectic player';

/** Vocab tags that name the kind of game, in tie-break order. */
const KIND_TAGS: Record<string, string> = {
  metroidvania: 'Metroidvania',
  roguelike: 'Roguelike',
  rpg: 'RPG',
  shooter: 'Shooter',
  platformer: 'Platformer',
  strategy: 'Strategy',
  puzzle: 'Puzzle',
  survival: 'Survival',
  stealth: 'Stealth',
  management: 'Management',
  sandbox: 'Sandbox',
  'open-world': 'Open-world',
  horror: 'Horror',
  competitive: 'Competitive',
  'co-op': 'Co-op',
  action: 'Action',
};
/** Vocab tags that name how the player plays, with the noun each gives, in tie-break order. */
const MANNER_TAGS: Record<string, string> = {
  exploration: 'explorer',
  challenging: 'challenger',
  methodical: 'tactician',
  'fast-paced': 'speedrunner',
  'story-rich': 'story-seeker',
  emotional: 'story-seeker',
  'slow-burn': 'story-seeker',
  relaxed: 'comfort player',
  cozy: 'comfort player',
  wholesome: 'comfort player',
};

/** The strongest tag of a table at or above the minimum weight; the table's order breaks ties. */
function strongest(vocab: Vocab, table: Record<string, string>): string | null {
  let best: string | null = null;
  for (const id of Object.keys(table)) {
    const w = vocab[id] ?? 0;
    if (w >= MIN_STYLE_WEIGHT && w > (best ? (vocab[best] ?? 0) : 0)) best = id;
  }
  return best;
}

/** A short playstyle label from the top taste-vocab tags, e.g. "Metroidvania explorer". */
export function playstyleLabel(vocab: Vocab): string {
  return playstyleParts(vocab).label;
}

function playstyleParts(vocab: Vocab): { label: string; tags: string[] } {
  const kind = strongest(vocab, KIND_TAGS);
  const manner = strongest(vocab, MANNER_TAGS);
  const noun = manner ? MANNER_TAGS[manner] : null;
  const name = kind ? KIND_TAGS[kind] : null;
  const tags = [kind, manner].filter((t): t is string => t !== null);
  if (name && noun) return { label: `${name} ${noun}`, tags };
  if (name) return { label: `${name} fan`, tags };
  if (noun) return { label: noun.charAt(0).toUpperCase() + noun.slice(1), tags };
  return { label: PLAYSTYLE_FALLBACK, tags: [] };
}

export interface TasteArt {
  coverUrl: string | null;
  coverUrlSmall: string | null;
  accent: string | null;
}

export interface TasteSummaryInput {
  /** The user's library rows, one per game and platform. */
  library: readonly LibraryItem[];
  feedback: readonly FeedbackItem[];
  /** Taste-vocab id -> label. */
  labels: Readonly<Record<string, string>>;
  /** Cover and accent by igdb id; games missing here have none. */
  art: ReadonlyMap<number, TasteArt>;
  now: Date;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * What the taste card shows: top genres/themes (taste weights, so ratings count), hours, most
 * played, a playstyle, status counts, platform split and top-rated games. Pure.
 */
export function tasteSummary(input: TasteSummaryInput): TasteSummary {
  const { labels, art } = input;
  const library = input.library.filter((l) => l.owned);
  const merged = mergeLibrary(library);
  const statusCounts = Object.fromEntries(
    STATUSES.map((s) => [s, 0]),
  ) as TasteSummary['statusCounts'];
  if (merged.length === 0) {
    return {
      empty: true,
      gameCount: 0,
      totalHours: 0,
      topTastes: [],
      mostPlayed: null,
      playstyle: null,
      statusCounts,
      platforms: [],
      topRated: [],
      covers: [],
    };
  }
  for (const m of merged) statusCounts[m.status] += 1;

  const profile = buildProfile({
    library: input.library,
    feedback: input.feedback,
    now: input.now,
  });
  const named = (list: typeof IGDB_GENRES) => new Map(list.map((f) => [f.id, f.name]));
  const genreNames = named(IGDB_GENRES);
  const themeNames = named(IGDB_THEMES);
  const tastes = [
    ...Object.entries(profile.genres).map(([id, weight]) => ({
      kind: 'genre' as const,
      name: genreNames.get(Number(id)),
      weight,
    })),
    ...Object.entries(profile.themes).map(([id, weight]) => ({
      kind: 'theme' as const,
      name: themeNames.get(Number(id)),
      weight,
    })),
  ]
    .flatMap((t) => (t.name && t.weight > 0 ? [{ ...t, name: t.name }] : []))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, TASTE_TOP_N);

  const hoursOf = (m: LibraryItem) => m.hours ?? 0;
  const top = merged.reduce<LibraryItem | null>(
    (best, m) =>
      hoursOf(m) > 0 &&
      (!best ||
        hoursOf(m) > hoursOf(best) ||
        (hoursOf(m) === hoursOf(best) && m.game.igdbId < best.game.igdbId))
        ? m
        : best,
    null,
  );

  const style = playstyleParts(profile.vocab);
  const playstyle = {
    label: style.label,
    tags: style.tags.map((t) => labels[t] ?? t),
  };

  const perPlatform = new Map<string, Set<number>>();
  for (const l of library) {
    if (!l.platform) continue;
    const ids = perPlatform.get(l.platform) ?? new Set<number>();
    ids.add(l.game.igdbId);
    perPlatform.set(l.platform, ids);
  }
  const platformTotal = [...perPlatform.values()].reduce((a, s) => a + s.size, 0);
  const platforms = [...perPlatform]
    .map(([platform, ids]) => ({ platform, games: ids.size, share: ids.size / platformTotal }))
    .sort((a, b) => b.games - a.games || a.platform.localeCompare(b.platform));

  const topRated = merged
    .flatMap((m) => (m.rating && m.rating >= 4 ? [{ m, rating: m.rating }] : []))
    .sort(
      (a, b) =>
        b.rating - a.rating || hoursOf(b.m) - hoursOf(a.m) || a.m.game.igdbId - b.m.game.igdbId,
    )
    .slice(0, TASTE_TOP_N)
    .map(({ m, rating }) => ({
      igdbId: m.game.igdbId,
      name: m.game.name,
      coverUrl: art.get(m.game.igdbId)?.coverUrl ?? null,
      rating,
    }));

  const weightOf = new Map(profile.weights.map((w) => [w.igdbId, w.weight]));
  const covers = merged
    .filter((m) => art.get(m.game.igdbId)?.coverUrl)
    .sort(
      (a, b) =>
        (weightOf.get(b.game.igdbId) ?? 0) - (weightOf.get(a.game.igdbId) ?? 0) ||
        a.game.igdbId - b.game.igdbId,
    )
    .slice(0, COLLAGE_MAX)
    .map((m) => ({
      igdbId: m.game.igdbId,
      name: m.game.name,
      coverUrl: art.get(m.game.igdbId)?.coverUrl ?? null,
      accent: art.get(m.game.igdbId)?.accent ?? null,
    }));

  return {
    empty: false,
    gameCount: merged.length,
    totalHours: round1(merged.reduce((a, m) => a + hoursOf(m), 0)),
    topTastes: tastes,
    mostPlayed: top
      ? {
          igdbId: top.game.igdbId,
          name: top.game.name,
          hours: round1(hoursOf(top)),
          coverUrl: art.get(top.game.igdbId)?.coverUrl ?? null,
          accent: art.get(top.game.igdbId)?.accent ?? null,
        }
      : null,
    playstyle,
    statusCounts,
    platforms,
    topRated,
    covers,
  };
}
