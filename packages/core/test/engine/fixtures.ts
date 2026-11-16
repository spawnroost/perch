import type { EngineGame, LibraryItem } from '../../src/engine/types.js';

export const NOW = new Date('2026-11-16T12:00:00Z');
export const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

type Vocab = Record<string, number>;

export function game(
  igdbId: number,
  name: string,
  vocab: Vocab,
  extra: Partial<EngineGame> = {},
): EngineGame {
  return {
    igdbId,
    name,
    firstRelease: new Date('2020-01-01T00:00:00Z'),
    genres: [],
    themes: [],
    similarIds: [],
    rating: 80,
    ratingCount: 1000,
    vocab,
    ...extra,
  };
}

export function item(
  g: EngineGame,
  hours: number | null,
  lastPlayedDaysAgo: number | null,
  status: LibraryItem['status'] = 'finished',
  owned = true,
): LibraryItem {
  return {
    game: g,
    hours,
    lastPlayed: lastPlayedDaysAgo === null ? null : daysAgo(lastPlayedDaysAgo),
    status,
    owned,
  };
}

// IGDB ids: genres 12 RPG, 14 Sport, 10 Racing, 31 Adventure, 25 Hack&slash, 9 Puzzle, 13 Simulator,
// 8 Platform, 15 Strategy; themes 17 Fantasy, 19 Horror, 18 Sci-fi.
const hades = game(
  1,
  'Hades',
  { roguelike: 1, mythology: 0.9, action: 0.8, 'fast-paced': 0.6, challenging: 0.7, fantasy: 0.5 },
  { genres: [25, 31], themes: [17], similarIds: [102, 101] },
);
const deadCells = game(
  2,
  'Dead Cells',
  { roguelike: 1, action: 0.8, 'fast-paced': 0.8, challenging: 0.8, metroidvania: 0.6 },
  { genres: [8, 25], similarIds: [101, 106] },
);
const hollow = game(
  3,
  'Hollow Knight',
  { metroidvania: 1, dark: 0.8, atmospheric: 0.8, challenging: 0.7, exploration: 0.7, action: 0.5 },
  { genres: [8, 31], similarIds: [106] },
);
const spire = game(
  4,
  'Slay the Spire',
  { roguelike: 1, strategy: 0.9, methodical: 0.7 },
  { genres: [15], similarIds: [] },
);
const celeste = game(
  5,
  'Celeste',
  { platformer: 1, challenging: 0.8, emotional: 0.6 },
  { genres: [8] },
);
const elden = game(
  6,
  'Elden Ring',
  { 'open-world': 1, dark: 0.8, fantasy: 0.9, challenging: 0.9, rpg: 0.8, action: 0.6 },
  { genres: [12, 31], themes: [17], similarIds: [108] },
);
const stardew = game(
  7,
  'Stardew Valley',
  { cozy: 1, relaxed: 0.8, management: 0.6, sandbox: 0.5, wholesome: 0.6 },
  { genres: [13] },
);
const disco = game(
  8,
  'Disco Elysium',
  { rpg: 1, 'story-rich': 1, mystery: 0.7, dark: 0.5 },
  { genres: [12] },
);
const obra = game(
  9,
  'Return of the Obra Dinn',
  { puzzle: 1, mystery: 0.9, atmospheric: 0.4 },
  { genres: [9] },
);
const portal = game(
  10,
  'Portal 2',
  { puzzle: 1, 'sci-fi': 0.8, comedic: 0.5 },
  { genres: [9], themes: [18] },
);
const witcher = game(
  11,
  'The Witcher 3',
  { rpg: 1, 'open-world': 0.9, fantasy: 1, 'story-rich': 0.8, dark: 0.4 },
  { genres: [12], themes: [17] },
);
const darkest = game(
  12,
  'Darkest Dungeon',
  { dark: 1, roguelike: 0.5, strategy: 0.5, methodical: 0.6, challenging: 0.8, horror: 0.4 },
  { genres: [12, 15] },
);

/** A Hades-heavy library of 12 games. */
export const LIBRARY: LibraryItem[] = [
  item(hades, 120, 5),
  item(deadCells, 60, 20),
  item(hollow, 50, 40),
  item(spire, 40, 60),
  item(celeste, 20, 100),
  item(elden, 100, 30),
  item(stardew, 30, 200),
  item(disco, 25, 150),
  item(obra, 6, 300),
  item(portal, 15, 400),
  item(witcher, 80, 70),
  item(darkest, 30, 90, 'dropped'),
];

const old = new Date('2012-06-01T00:00:00Z');
export const CANDIDATES: EngineGame[] = [
  game(
    101,
    'Rogue Legacy 2',
    { roguelike: 1, action: 0.8, 'fast-paced': 0.7, challenging: 0.8, platformer: 0.4 },
    { genres: [8], rating: 82 },
  ),
  game(
    102,
    'Odyssey of Gods',
    { roguelike: 1, mythology: 1, action: 0.8, 'fast-paced': 0.6, fantasy: 0.5, challenging: 0.6 },
    { genres: [25], rating: 80 },
  ),
  game(103, 'Pro Soccer 24', { competitive: 1, 'fast-paced': 0.3 }, { genres: [14], rating: 88 }),
  game(104, 'Hoops Legends', { competitive: 1, 'fast-paced': 0.3 }, { genres: [14], rating: 86 }),
  game(105, 'Turbo GP', { 'fast-paced': 0.7, competitive: 0.5 }, { genres: [10], rating: 84 }),
  game(
    106,
    'Ori and the Lost Forest',
    { metroidvania: 1, atmospheric: 0.9, exploration: 0.8, emotional: 0.7, platformer: 0.5 },
    { genres: [8], rating: 90 },
  ),
  game(
    107,
    'Cozy Farmstead',
    { cozy: 1, relaxed: 0.9, management: 0.7, sandbox: 0.6 },
    { genres: [13], rating: 78 },
  ),
  game(
    108,
    'Ashen Blade',
    { dark: 0.9, challenging: 1, rpg: 0.8, action: 0.7, fantasy: 0.8, 'open-world': 0.4 },
    { genres: [12], rating: 85 },
  ),
  game(
    109,
    'Party Pals',
    { comedic: 1, competitive: 0.6, 'co-op': 0.6, whimsical: 0.5 },
    { genres: [11], rating: 74 },
  ),
  game(110, 'Tower Tactics', { strategy: 1, methodical: 0.8 }, { genres: [15], rating: 80 }),
  game(
    111,
    'Deck of Embers',
    { roguelike: 0.9, strategy: 0.8, methodical: 0.6, dark: 0.3 },
    { genres: [15], rating: 83 },
  ),
  game(
    112,
    'Stealth Syndicate',
    { stealth: 1, 'high-tension': 0.6, crime: 0.5 },
    { genres: [31], rating: 79 },
  ),
  game(113, 'Cosmic Puzzler', { puzzle: 1, 'sci-fi': 0.7 }, { genres: [9], rating: 81 }),
  game(
    114,
    'Mythic Quest Saga',
    { mythology: 1, fantasy: 0.8, rpg: 0.6, 'story-rich': 0.5 },
    { genres: [12], rating: 72 },
  ),
  game(
    115,
    'Dread Manor',
    { horror: 1, dark: 0.8, 'high-tension': 0.8 },
    { genres: [31], rating: 77 },
  ),
  game(116, 'Gridiron Pro', { competitive: 1 }, { genres: [14], rating: 70 }),
  game(
    117,
    'Neon Shooter',
    { shooter: 1, 'fast-paced': 0.9, action: 0.7 },
    { genres: [5], rating: 76 },
  ),
  game(
    118,
    'Farm Tycoon',
    { management: 1, sandbox: 0.6, relaxed: 0.5 },
    { genres: [13], rating: 71 },
  ),
  game(
    119,
    'Classic Quest',
    { fantasy: 0.8, rpg: 0.7, 'story-rich': 0.5 },
    { genres: [12], rating: 85, firstRelease: old },
  ),
  game(
    120,
    'Unrated Curio',
    { roguelike: 0.6, action: 0.4 },
    { genres: [25], rating: null, ratingCount: null },
  ),
];
