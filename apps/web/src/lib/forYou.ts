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
export const BACKLOG_ID = 'backlog';
export const MORE_PICKS_ID = 'more-picks';
/** Fewest picks sharing a source game for a "Because you played" shelf. */
export const SOURCE_SHELF_MIN = 2;

/**
 * Shelves for the launcher, grouped by reason. Each game appears once and the hero game never.
 * Claim order, most specific first: From your backlog, Short sessions (at most
 * SHORT_SESSION_MAX_HOURS, shortest first), then "Because you played X" per source game; leftovers
 * go on More picks. Shown order: Because shelves (largest first), Short sessions, backlog, more.
 */
export function buildShelves(
  picks: readonly Recommendation[],
  heroId: number | null = null,
): PickShelf[] {
  const seen = new Set<number>(heroId === null ? [] : [heroId]);
  const claim = (list: readonly Recommendation[]) =>
    list.filter((p) => !seen.has(p.game.igdbId) && seen.add(p.game.igdbId));

  const backlog = claim(picks.filter((p) => p.backlog));

  const timed = picks.flatMap((p) => {
    const hours = timeToBeatHours(p.timeToBeat);
    return hours !== null && hours <= SHORT_SESSION_MAX_HOURS && !seen.has(p.game.igdbId)
      ? [{ p, hours }]
      : [];
  });
  const short =
    timed.length >= SHORT_SESSION_MIN
      ? claim(timed.sort((a, b) => a.hours - b.hours).map((t) => t.p))
      : [];

  const bySource = new Map<number, { name: string; picks: Recommendation[] }>();
  for (const p of picks) {
    if (seen.has(p.game.igdbId) || !p.sourceGame) continue;
    const group = bySource.get(p.sourceGame.igdbId) ?? { name: p.sourceGame.name, picks: [] };
    group.picks.push(p);
    bySource.set(p.sourceGame.igdbId, group);
  }
  const because: PickShelf[] = [...bySource]
    .filter(([, g]) => g.picks.length >= SOURCE_SHELF_MIN)
    .sort((a, b) => b[1].picks.length - a[1].picks.length)
    .map(([id, g]) => ({
      id: `because-${id}`,
      title: `Because you played ${g.name}`,
      picks: claim(g.picks),
    }));
  const more = claim(picks);

  const shelves: PickShelf[] = [
    ...because,
    { id: SHORT_SESSIONS_ID, title: 'Short sessions', picks: short },
    { id: BACKLOG_ID, title: 'From your backlog', picks: backlog },
    { id: MORE_PICKS_ID, title: 'More picks', picks: more },
  ];
  return shelves.filter((s) => s.picks.length > 0);
}

/** An option in the device switcher: All, then one per device. */
export interface DeviceOption {
  id: string;
  label: string;
}

export function deviceOptions(devices: readonly { id: string; name: string }[]): DeviceOption[] {
  return [{ id: ALL_TAB, label: 'All' }, ...devices.map((d) => ({ id: d.id, label: d.name }))];
}

export interface FitChip {
  label: string;
  tone: Tone;
}

/**
 * One HUD chip per device: its name and a tone from the will-it-run status. The omitted device's
 * chip is dropped only when it is green (the feed already implies it runs); otherwise it stays.
 */
export function fitChips(fits: readonly DeviceFit[], omitDeviceId?: string): FitChip[] {
  return fits
    .filter((f) => f.deviceId !== omitDeviceId || f.status !== 'green')
    .map((f) => ({ label: f.deviceName, tone: fitDisplay(f.status).tone }));
}

/** A chip on a launcher card; `plain` chips carry no fit tone (no icon, no spoken status). */
export interface PickChip extends FitChip {
  plain?: true;
  /** Spoken text standing in for a visible label that hides detail (the "+N" overflow chip). */
  srLabel?: string;
}

/** Chips a launcher card shows before the rest collapse into a "+N" chip. */
export const CARD_CHIP_LIMIT = 2;

/**
 * Card chips for a pick: per-device fit (minus a green `omitDeviceId`, the selected device), then
 * Backlog and Steam Deck compatibility when set. With a Steam Deck device (`hasDeckDevice`; when
 * `omitDeviceId` is set, that it is the selected device) the fit chip covers deck status, so the
 * Deck chip is dropped, unless the selected device's fit is not green.
 */
export function pickChips(
  rec: Pick<Recommendation, 'fits' | 'backlog' | 'deck'>,
  { hasDeckDevice = false, omitDeviceId }: { hasDeckDevice?: boolean; omitDeviceId?: string } = {},
): PickChip[] {
  const chips: PickChip[] = fitChips(rec.fits, omitDeviceId);
  if (rec.backlog) chips.push({ label: 'Backlog', tone: 'unknown', plain: true });
  const selectedFit = rec.fits.find((f) => f.deviceId === omitDeviceId);
  const deckCovered =
    hasDeckDevice && (selectedFit === undefined || selectedFit.status === 'green');
  if (rec.deck && !deckCovered) {
    const { label, tone } = deckDisplay(rec.deck);
    chips.push({ label: `Deck: ${label}`, tone });
  }
  return chips;
}

/** The first `max` chips, plus a plain "+N" chip standing in for the rest. */
export function capChips(chips: readonly PickChip[], max: number = CARD_CHIP_LIMIT): PickChip[] {
  if (chips.length <= max) return [...chips];
  const hidden = chips.slice(max);
  return [
    ...chips.slice(0, max),
    {
      label: `+${hidden.length}`,
      tone: 'unknown',
      plain: true,
      srLabel: `and ${hidden.length} more: ${hidden.map((c) => c.label).join(', ')}`,
    },
  ];
}

/** Platforms shown on the game detail before the rest collapse into "+N". */
export const DETAIL_PLATFORM_LIMIT = 4;

/** Plain chips for a game's platform names, capped like card chips. */
export function platformChips(names: readonly string[]): PickChip[] {
  return capChips(
    names.map((label) => ({ label, tone: 'unknown' as const, plain: true as const })),
    DETAIL_PLATFORM_LIMIT,
  );
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
