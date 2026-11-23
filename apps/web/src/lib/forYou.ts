import type { DeviceView, RecommendationsResponse } from '@perch/core';
import { firstOfEach } from './motion';
import { deckDisplay, fitDisplay, type Tone } from './fit';
import { timeToBeatHours } from './timeToBeat';
import { hasDeckDevice, isPhoneKind, mobileDeviceIds } from './devices';

export const ALL_TAB = 'all';
/** Picks per feed (the all-devices feed and each device's feed) on For you; its See all grids reuse them. */
export const FOR_YOU_LIMIT = 60;

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
  /** Stable shelf key (also the See all route param): backlog | short | source-<igdbId> | more. */
  id: string;
  title: string;
  /** Picks shown on the shelf: at most the cap. */
  picks: Recommendation[];
  /** Every pick the shelf claimed, before the cap. */
  total: number;
  /** The shelf ends with a See all tile. */
  seeAll: boolean;
}

/** Fewest short games for the Short sessions shelf to be worth showing. */
export const SHORT_SESSION_MIN = 3;
/** Longest time to beat, in hours, for a game to count as a short session. */
export const SHORT_SESSION_MAX_HOURS = 12;
export const SHORT_SESSIONS_ID = 'short';
export const BACKLOG_ID = 'backlog';
export const MORE_PICKS_ID = 'more';
export const ON_THE_GO_ID = 'on-the-go';
/** Fewest cross-device picks for the Play it on the go shelf to be worth showing. */
export const ON_THE_GO_MIN = 3;

/** Runs on one of the user's phones/tablets (green) and on one of their other devices (green or yellow). */
export function isOnTheGo(
  fits: readonly Pick<DeviceFit, 'deviceId' | 'status'>[],
  mobileIds: ReadonlySet<string>,
): boolean {
  if (mobileIds.size === 0) return false;
  return (
    fits.some((f) => mobileIds.has(f.deviceId) && f.status === 'green') &&
    fits.some((f) => !mobileIds.has(f.deviceId) && (f.status === 'green' || f.status === 'yellow'))
  );
}
/** Fewest picks sharing a source game for a "Because you played" shelf; fewer go on More picks. */
export const SOURCE_SHELF_MIN = 4;
/** Cards on a shelf before the rest sit behind See all. */
export const SHELF_CAP = 12;

export const sourceShelfKey = (igdbId: number) => `source-${igdbId}`;

/** The shelf key from a route param; null unless it is one buildShelves can make. */
export function parseShelfKey(param: string | undefined): string | null {
  if ([BACKLOG_ID, SHORT_SESSIONS_ID, ON_THE_GO_ID, MORE_PICKS_ID].includes(param ?? ''))
    return param!;
  return param && /^source-([1-9]\d*)$/.test(param) ? param : null;
}

/** The `?device=` query for a switcher selection; empty for All. */
export const deviceSearch = (device: string): string =>
  device === ALL_TAB ? '' : `?device=${encodeURIComponent(device)}`;

/** The switcher selection from a `device` query value; missing or empty means All. */
export const parseDevice = (value: string | null | undefined): string => value || ALL_TAB;

/** Route of a shelf's See all grid; the device rides along unless it is All. */
export const shelfPath = (key: string, device: string): string =>
  `/for-you/${key}${deviceSearch(device)}`;

/** Route of a game's "More like this" grid; the device rides along unless it is All. */
export const similarPath = (igdbId: number, device: string): string =>
  `/for-you/like/${igdbId}${deviceSearch(device)}`;

/**
 * Shelves for the launcher, grouped by reason. Each game appears once and the hero game never.
 * Claim order, most specific first: From your backlog, Short sessions (at most
 * SHORT_SESSION_MAX_HOURS, shortest first), Play it on the go (isOnTheGo with `mobileIds`, at
 * least ON_THE_GO_MIN), then "Because you played X" per source game with at least
 * SOURCE_SHELF_MIN picks; leftovers go on More picks. Shown order: Because shelves (largest
 * first), Short sessions, on the go, backlog, more. A shelf shows at most `cap` cards; the rest are only
 * counted in `total` (they stay claimed, so they never spill onto another shelf).
 */
export function buildShelves(
  picks: readonly Recommendation[],
  heroId: number | null = null,
  cap: number = SHELF_CAP,
  mobileIds: ReadonlySet<string> = new Set(),
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

  const portable = picks.filter((p) => !seen.has(p.game.igdbId) && isOnTheGo(p.fits, mobileIds));
  const onTheGo = portable.length >= ON_THE_GO_MIN ? claim(portable) : [];

  const bySource = new Map<number, { name: string; picks: Recommendation[] }>();
  for (const p of picks) {
    if (seen.has(p.game.igdbId) || !p.sourceGame) continue;
    const group = bySource.get(p.sourceGame.igdbId) ?? { name: p.sourceGame.name, picks: [] };
    group.picks.push(p);
    bySource.set(p.sourceGame.igdbId, group);
  }
  const because = [...bySource]
    .filter(([, g]) => g.picks.length >= SOURCE_SHELF_MIN)
    .sort((a, b) => b[1].picks.length - a[1].picks.length)
    .map(([id, g]) => ({
      id: sourceShelfKey(id),
      title: `Because you played ${g.name}`,
      claimed: claim(g.picks),
    }));
  const more = claim(picks);

  return [
    ...because,
    { id: SHORT_SESSIONS_ID, title: 'Short sessions', claimed: short },
    { id: ON_THE_GO_ID, title: 'Play it on the go', claimed: onTheGo },
    { id: BACKLOG_ID, title: 'From your backlog', claimed: backlog },
    { id: MORE_PICKS_ID, title: 'More picks', claimed: more },
  ]
    .filter((s) => s.claimed.length > 0)
    .map(({ claimed, ...shelf }) => ({
      ...shelf,
      picks: claimed.slice(0, cap),
      total: claimed.length,
      seeAll: claimed.length > cap,
    }));
}

/** A shelf's full pick list from a feed (the launcher's shelf without the cap): what its See all grid shows. */
export function shelfPicks(
  picks: readonly Recommendation[],
  key: string,
  heroId: number | null = null,
  mobileIds: ReadonlySet<string> = new Set(),
): { title: string; picks: Recommendation[] } | null {
  const shelf = buildShelves(picks, heroId, Infinity, mobileIds).find((s) => s.id === key);
  return shelf ? { title: shelf.title, picks: shelf.picks } : null;
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
  {
    hasDeckDevice = false,
    omitDeviceId,
    onTheGo,
  }: {
    hasDeckDevice?: boolean;
    omitDeviceId?: string;
    /** Cross-device pick: its green phone/tablet fits collapse into one leading chip with this label. */
    onTheGo?: { label: string; mobileIds: ReadonlySet<string> };
  } = {},
): PickChip[] {
  const fits = onTheGo
    ? rec.fits.filter((f) => !(onTheGo.mobileIds.has(f.deviceId) && f.status === 'green'))
    : rec.fits;
  const chips: PickChip[] = [
    ...(onTheGo ? [{ label: onTheGo.label, tone: fitDisplay('green').tone }] : []),
    ...fitChips(fits, omitDeviceId),
  ];
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

/**
 * Chips for a launcher card (shelf or See all grid) when `selectedId` is the picked device (All, or
 * one that no longer exists, when it matches none): the selected device's green fit is dropped, and
 * with a Deck device the Deck chip too. Capped to CARD_CHIP_LIMIT plus "+N".
 */
export function cardChips(
  rec: Pick<Recommendation, 'fits' | 'backlog' | 'deck'>,
  devices: readonly DeviceView[],
  selectedId: string,
): PickChip[] {
  const selected = devices.find((d) => d.id === selectedId);
  const mobileIds = mobileDeviceIds(devices);
  const goes = !(selected && mobileIds.has(selected.id)) && isOnTheGo(rec.fits, mobileIds);
  const onPhone = devices.some(
    (d) => isPhoneKind(d.kind) && rec.fits.some((f) => f.deviceId === d.id && f.status === 'green'),
  );
  return capChips(
    pickChips(rec, {
      hasDeckDevice: selected ? selected.kind === 'steam-deck' : hasDeckDevice(devices),
      omitDeviceId: selected?.id,
      ...(goes && {
        onTheGo: { label: onPhone ? 'Also on your phone' : 'Also on your tablet', mobileIds },
      }),
    }),
  );
}

/** Platforms shown on the game detail before the rest collapse into "+N". */
export const DETAIL_PLATFORM_LIMIT = 4;

/** Plain chips for a game's platform names, capped like card chips unless `expanded`. */
export function platformChips(names: readonly string[], expanded = false): PickChip[] {
  const chips = names.map((label) => ({ label, tone: 'unknown' as const, plain: true as const }));
  return expanded ? chips : capChips(chips, DETAIL_PLATFORM_LIMIT);
}

/** Shelf-scoped key for a card: the same game can sit on several shelves. */
export const cardKey = (shelfId: string, igdbId: number) => `${shelfId}:${igdbId}`;

/**
 * Cards allowed to carry the shared-element id: each game's first card in shelf order. A layoutId
 * must be unique on screen, so repeats on later shelves open without the cover expand.
 */
export function layoutOwners(shelves: readonly Pick<PickShelf, 'id' | 'picks'>[]): Set<string> {
  const cards = shelves.flatMap((shelf) =>
    shelf.picks.map(({ game }) => ({ igdbId: game.igdbId, key: cardKey(shelf.id, game.igdbId) })),
  );
  return new Set([...firstOfEach(cards, (c) => c.igdbId)].map((c) => c.key));
}

/** Shared tags from a "Like <seed>: <tags>" reason (the page title already names the seed). */
export function likeMeta(reason: string, seedName: string): string | undefined {
  const prefix = `Like ${seedName}: `;
  return reason.startsWith(prefix) ? reason.slice(prefix.length) || undefined : undefined;
}
