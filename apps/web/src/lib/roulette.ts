/** Backlog roulette logic: the filters, the "last picks" memory and the Play action's targets. */
import type { LibraryEntry, Mood, Relaxed } from '@perch/core';
import { ALL_TAB } from './forYou';

export type RouletteFilters = {
  /** A device id, or ALL_TAB for no device filter. */
  device: string;
  /** Time available in minutes, or null for any. */
  minutes: number | null;
  mood: Mood | null;
};

export const NO_FILTERS: RouletteFilters = { device: ALL_TAB, minutes: null, mood: null };

/** Chip id for "no choice" in the minutes and mood groups. */
export const ANY = 'any';

export const MOOD_OPTIONS: readonly { id: string; label: string }[] = [
  { id: ANY, label: 'Any mood' },
  { id: 'chill', label: 'Chill' },
  { id: 'intense', label: 'Intense' },
  { id: 'story', label: 'Story' },
  { id: 'quick', label: 'Quick' },
];

/** Query for `/api/roulette`: only what the player chose, plus the games to skip. */
export function rouletteParams(filters: RouletteFilters, exclude: readonly number[]) {
  return {
    ...(filters.device !== ALL_TAB ? { device: filters.device } : {}),
    ...(filters.minutes !== null ? { minutes: filters.minutes } : {}),
    ...(filters.mood !== null ? { mood: filters.mood } : {}),
    ...(exclude.length > 0 ? { exclude: exclude.join(',') } : {}),
  };
}

/** Games spun this recently are skipped (the API puts them back when nothing else is left). */
export const RECENT_PICKS_MAX = 5;
export const ROULETTE_RECENT_KEY = 'perch.roulette.recent';

type Store = Pick<Storage, 'getItem' | 'setItem'>;

/** The last picks, newest first. Empty when storage is missing, blocked or holds something else. */
export function readRecentPicks(store: Store | null): number[] {
  try {
    const raw: unknown = JSON.parse(store?.getItem(ROULETTE_RECENT_KEY) ?? '[]');
    if (!Array.isArray(raw)) return [];
    return raw.filter((n): n is number => Number.isInteger(n) && n > 0).slice(0, RECENT_PICKS_MAX);
  } catch {
    return [];
  }
}

/** Puts a pick first (a repeat moves up) and keeps the last {@link RECENT_PICKS_MAX}. Never throws. */
export function rememberPick(store: Store | null, igdbId: number): void {
  const next = [igdbId, ...readRecentPicks(store).filter((id) => id !== igdbId)];
  try {
    store?.setItem(ROULETTE_RECENT_KEY, JSON.stringify(next.slice(0, RECENT_PICKS_MAX)));
  } catch {
    // storage is full or blocked: the next spin may repeat a game, nothing worse
  }
}

/** A line saying which filter the pick ignored, or null when it respected them all. */
export function relaxedNote(relaxed: Relaxed | null, mood: Mood | null): string | null {
  if (relaxed === 'mood') {
    return `Nothing in your backlog is quite ${mood ?? 'that'}, so here is a wildcard.`;
  }
  if (relaxed === 'exclude') return 'You have spun through everything: games can come up again.';
  return null;
}

/** Library entry ids to set to Playing: the game's owned entries not already playing. */
export function entriesToPlay(entries: readonly LibraryEntry[], igdbId: number): string[] {
  return entries
    .filter((e) => e.igdbId === igdbId && e.owned && e.status !== 'playing')
    .map((e) => e.id);
}

/** Card-shuffle keyframes: sideways swing (px), tilt (deg) and start delay (s) per card back. */
export const SHUFFLE_CARDS = [
  { x: [0, 64, 0, -64, 0], rotate: [-8, 12, -8, -12, -8], delay: 0 },
  { x: [0, -56, 0, 56, 0], rotate: [4, -10, 4, 10, 4], delay: 0.12 },
  { x: [0, 40, 0, -40, 0], rotate: [0, 6, 0, -6, 0], delay: 0.24 },
] as const;
export const SHUFFLE_LOOP_S = 0.9;

/** The pick's entrance: it flips up from the side (full motion) or just fades in (reduced). */
export const REVEAL_FROM = { opacity: 0, rotateY: -90, scale: 0.8, y: 24 } as const;
export const REVEAL_TO = { opacity: 1, rotateY: 0, scale: 1, y: 0 } as const;
export const REVEAL_FADE_S = 0.2;
/** Glow behind the revealed card breathes between these opacities. */
export const GLOW_PULSE = [0.45, 1, 0.45] as const;
export const GLOW_PULSE_S = 2.4;
