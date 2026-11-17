import type { RecommendationsResponse } from '@perch/core';
import { firstOfEach } from './motion';
import { deckDisplay, fitDisplay, type Tone } from './fit';
import { timeToBeatHours } from './timeToBeat';

export const ALL_TAB = 'all';
/** Picks per feed (the all-devices feed and each device's feed) on For you. */
export const FOR_YOU_LIMIT = 20;

export type Recommendation = RecommendationsResponse['recommendations'][number];
/** One device's will-it-run result for a pick. */
export type DeviceFit = Recommendation['fits'][number];

/** IGDB id from the `/games/:id` route param; null unless a positive integer. */
export function parseGameId(param: string | undefined): number | null {
  if (!param || !/^\d+$/.test(param)) return null;
  const id = Number(param);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export interface PickShelf {
  id: string;
  title: string;
  picks: Recommendation[];
}

/** Fewest short games for the Short sessions shelf to be worth showing. */
export const SHORT_SESSION_MIN = 3;
/** Longest time to beat, in hours, for a game to count as a short session. */
export const SHORT_SESSION_MAX_HOURS = 12;
export const SHORT_SESSIONS_ID = 'short-sessions';

/** One device's server-ranked feed. */
export interface DeviceFeed {
  id: string;
  name: string;
  picks: readonly Recommendation[];
}

/**
 * Shelves for the launcher: All picks, one per device with a non-empty feed (server-ranked for
 * that device), then Short sessions (all picks that take at most SHORT_SESSION_MAX_HOURS).
 */
export function buildShelves(
  picks: readonly Recommendation[],
  deviceFeeds: readonly DeviceFeed[],
): PickShelf[] {
  const shelves: PickShelf[] = [{ id: ALL_TAB, title: 'All picks', picks: [...picks] }];
  for (const d of deviceFeeds) {
    if (d.picks.length > 0) {
      shelves.push({ id: d.id, title: `Fits your ${d.name}`, picks: [...d.picks] });
    }
  }
  const short = picks.flatMap((p) => {
    const hours = timeToBeatHours(p.timeToBeat);
    return hours !== null && hours <= SHORT_SESSION_MAX_HOURS ? [{ p, hours }] : [];
  });
  if (short.length >= SHORT_SESSION_MIN) {
    short.sort((a, b) => a.hours - b.hours);
    shelves.push({
      id: SHORT_SESSIONS_ID,
      title: 'Short sessions',
      picks: short.map((t) => t.p),
    });
  }
  return shelves;
}

export interface FitChip {
  label: string;
  tone: Tone;
}

/** One HUD chip per device: its name and a tone from the will-it-run status. */
export function fitChips(fits: readonly DeviceFit[]): FitChip[] {
  return fits.map((f) => ({ label: f.deviceName, tone: fitDisplay(f.status).tone }));
}

/** A chip on a launcher card; `plain` chips carry no fit tone (no icon, no spoken status). */
export interface PickChip extends FitChip {
  plain?: true;
}

/** Chips a launcher card shows before the rest collapse into a "+N" chip. */
export const CARD_CHIP_LIMIT = 2;

/**
 * Card chips for a pick: per-device fit, then Backlog and Steam Deck compatibility when set. With a
 * Steam Deck device the fit chip already covers deck status, so the separate Deck chip is dropped.
 */
export function pickChips(
  rec: Pick<Recommendation, 'fits' | 'backlog' | 'deck'>,
  { hasDeckDevice = false }: { hasDeckDevice?: boolean } = {},
): PickChip[] {
  const chips: PickChip[] = fitChips(rec.fits);
  if (rec.backlog) chips.push({ label: 'Backlog', tone: 'unknown', plain: true });
  if (rec.deck && !hasDeckDevice) {
    const { label, tone } = deckDisplay(rec.deck);
    chips.push({ label: `Deck: ${label}`, tone });
  }
  return chips;
}

/** The first `max` chips, plus a plain "+N" chip standing in for the rest. */
export function capChips(chips: readonly PickChip[], max: number = CARD_CHIP_LIMIT): PickChip[] {
  if (chips.length <= max) return [...chips];
  return [
    ...chips.slice(0, max),
    { label: `+${chips.length - max}`, tone: 'unknown', plain: true },
  ];
}

/** Shelf-scoped key for a card: the same game can sit on several shelves. */
export const cardKey = (shelfId: string, igdbId: number) => `${shelfId}:${igdbId}`;

/**
 * Cards allowed to carry the shared-element id: each game's first card in shelf order. A layoutId
 * must be unique on screen, so repeats on later shelves open without the cover expand.
 */
export function layoutOwners(shelves: readonly PickShelf[]): Set<string> {
  const cards = shelves.flatMap((shelf) =>
    shelf.picks.map(({ game }) => ({ igdbId: game.igdbId, key: cardKey(shelf.id, game.igdbId) })),
  );
  return new Set([...firstOfEach(cards, (c) => c.igdbId)].map((c) => c.key));
}
