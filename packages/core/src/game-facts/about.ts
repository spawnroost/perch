import { z } from 'zod';
import type { Multiplayer as StoredMultiplayer } from '@perch/db';

/** Pure mapping from IGDB raw shapes and stored ids to the "About" facts block. */

/** IGDB `game_modes` ids; ids we don't know are dropped. */
const GAME_MODE_NAMES: Record<number, string> = {
  1: 'Single player',
  2: 'Multiplayer',
  3: 'Co-operative',
  4: 'Split screen',
  5: 'MMO',
  6: 'Battle royale',
};

/** IGDB `player_perspectives` ids. */
const PERSPECTIVE_NAMES: Record<number, string> = {
  1: 'First person',
  2: 'Third person',
  3: 'Bird view / Isometric',
  4: 'Side view',
  5: 'Text',
  6: 'Auditory',
  7: 'Virtual reality',
};

const named = (names: Record<number, string>, ids: readonly number[]) =>
  ids.flatMap((id) => names[id] ?? []);

export const gameModeNames = (ids: readonly number[]) => named(GAME_MODE_NAMES, ids);
export const perspectiveNames = (ids: readonly number[]) => named(PERSPECTIVE_NAMES, ids);

export interface RawInvolvedCompany {
  company?: { name?: string } | undefined;
  developer?: boolean | undefined;
  publisher?: boolean | undefined;
}

/** Developer and publisher names, deduplicated, in IGDB order. */
export function parseCompanies(raw: readonly RawInvolvedCompany[] | undefined): {
  developers: string[];
  publishers: string[];
} {
  const pick = (flag: 'developer' | 'publisher') => [
    ...new Set((raw ?? []).flatMap((c) => (c[flag] && c.company?.name ? [c.company.name] : []))),
  ];
  return { developers: pick('developer'), publishers: pick('publisher') };
}

export interface RawMultiplayerMode {
  campaigncoop?: boolean | undefined;
  onlinecoop?: boolean | undefined;
  onlinecoopmax?: number | undefined;
  offlinecoop?: boolean | undefined;
  splitscreen?: boolean | undefined;
}

/** Co-op / split-screen modes merged over all platforms (the shape also stored in the DB). */
export const multiplayerSchema = z.object({
  /** Campaign co-op. */
  campaign: z.boolean(),
  online: z.boolean(),
  /** Most online co-op players on any platform; null when unknown. */
  onlineMax: z.number().int().nullable(),
  /** Offline (couch) co-op. */
  local: z.boolean(),
  splitscreen: z.boolean(),
}) satisfies z.ZodType<StoredMultiplayer>;
export type Multiplayer = z.infer<typeof multiplayerSchema>;

/**
 * Merges IGDB's per-platform multiplayer entries; null when none of them has a co-op or
 * split-screen flag set (a bare player count says nothing about co-op).
 */
export function parseMultiplayer(
  raw: readonly RawMultiplayerMode[] | undefined,
): Multiplayer | null {
  if (!raw || raw.length === 0) return null;
  const max = Math.max(0, ...raw.map((m) => m.onlinecoopmax ?? 0));
  const modes = {
    campaign: raw.some((m) => m.campaigncoop === true),
    online: raw.some((m) => m.onlinecoop === true),
    onlineMax: max > 0 ? max : null,
    local: raw.some((m) => m.offlinecoop === true),
    splitscreen: raw.some((m) => m.splitscreen === true),
  };
  return modes.campaign || modes.online || modes.local || modes.splitscreen ? modes : null;
}

export interface RawNamed {
  id: number;
  name?: string | undefined;
}

/**
 * The series to show: the named collection with the lowest id, else the named franchise with
 * the lowest id. IGDB's array order is not stable, so the choice is by id to stay deterministic.
 */
export function pickSeriesName(
  collections: readonly RawNamed[] | undefined,
  franchises: readonly RawNamed[] | undefined,
): string | null {
  const lowest = (list: readonly RawNamed[] | undefined) =>
    [...(list ?? [])].filter((r) => r.name).sort((a, b) => a.id - b.id)[0]?.name;
  return lowest(collections) ?? lowest(franchises) ?? null;
}

export interface AboutInput {
  developers: readonly string[];
  publishers: readonly string[];
  gameModes: readonly number[];
  perspectives: readonly number[];
  multiplayer: Multiplayer | null;
  dlcCount: number;
  expansionCount: number;
  seriesName: string | null;
}

export interface GameAbout {
  developers: string[];
  publishers: string[];
  modes: string[];
  perspectives: string[];
  coop: Multiplayer | null;
  dlcCount: number;
  expansionCount: number;
  series: string | null;
}

export function buildAbout(game: AboutInput): GameAbout {
  return {
    developers: [...game.developers],
    publishers: [...game.publishers],
    modes: gameModeNames(game.gameModes),
    perspectives: perspectiveNames(game.perspectives),
    coop: game.multiplayer,
    dlcCount: game.dlcCount,
    expansionCount: game.expansionCount,
    series: game.seriesName,
  };
}
