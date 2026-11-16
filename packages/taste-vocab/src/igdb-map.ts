import type { VocabId } from './vocab.js';

/** { vocabId: weight 0-1 } contributed by one IGDB id. */
export type VocabWeights = Partial<Record<VocabId, number>>;
export type IgdbMap = Readonly<Record<number, VocabWeights>>;

// IGDB ids and names below were verified against the live API (/genres, /themes, /keywords).
// The trailing comment on each row is the IGDB name.

/** All IGDB genres. */
export const GENRE_MAP: IgdbMap = {
  2: { puzzle: 0.5, mystery: 0.3, 'story-rich': 0.4 }, // Point-and-click
  4: { competitive: 0.6, 'fast-paced': 0.6, action: 0.8 }, // Fighting
  5: { shooter: 1, 'fast-paced': 0.4, action: 0.5 }, // Shooter
  7: { 'fast-paced': 0.3, whimsical: 0.2 }, // Music
  8: { platformer: 1 }, // Platform
  9: { puzzle: 1, relaxed: 0.3 }, // Puzzle
  10: { 'fast-paced': 0.7, competitive: 0.5 }, // Racing
  11: { strategy: 1, competitive: 0.4, 'fast-paced': 0.4 }, // Real Time Strategy (RTS)
  12: { rpg: 1, 'story-rich': 0.4 }, // Role-playing (RPG)
  13: { management: 0.5, sandbox: 0.3 }, // Simulator
  14: { competitive: 0.7, 'fast-paced': 0.3 }, // Sport
  15: { strategy: 1 }, // Strategy
  16: { strategy: 1, methodical: 0.6 }, // Turn-based strategy (TBS)
  24: { strategy: 0.7, methodical: 0.6 }, // Tactical
  25: { action: 0.6, 'fast-paced': 0.7 }, // Hack and slash/Beat 'em up
  26: { puzzle: 0.4, whimsical: 0.3, competitive: 0.2 }, // Quiz/Trivia
  30: { 'fast-paced': 0.4, competitive: 0.3 }, // Pinball
  31: { exploration: 0.5, 'story-rich': 0.4 }, // Adventure
  32: {}, // Indie (no taste signal)
  33: { 'fast-paced': 0.6, action: 0.4 }, // Arcade
  34: { 'story-rich': 1, 'slow-burn': 0.5 }, // Visual Novel
  35: { strategy: 0.5, methodical: 0.4 }, // Card & Board Game
  36: { competitive: 1, strategy: 0.4, 'fast-paced': 0.5, 'co-op': 0.3 }, // MOBA
};

/** All IGDB themes. */
export const THEME_MAP: IgdbMap = {
  1: { action: 0.4, 'fast-paced': 0.4 }, // Action
  17: { fantasy: 1 }, // Fantasy
  18: { 'sci-fi': 1 }, // Science fiction
  19: { horror: 1, dark: 0.6, 'high-tension': 0.6 }, // Horror
  20: { 'high-tension': 0.8, mystery: 0.4 }, // Thriller
  21: { survival: 1 }, // Survival
  22: { historical: 1 }, // Historical
  23: { stealth: 1 }, // Stealth
  27: { comedic: 1, whimsical: 0.4 }, // Comedy
  28: { management: 0.8 }, // Business
  31: { 'story-rich': 0.6, emotional: 0.6 }, // Drama
  32: { historical: 0.3 }, // Non-fiction
  33: { sandbox: 1 }, // Sandbox
  34: { relaxed: 0.3, puzzle: 0.3 }, // Educational
  35: { whimsical: 0.6, wholesome: 0.5, relaxed: 0.4 }, // Kids
  38: { 'open-world': 1 }, // Open world
  39: { war: 1 }, // Warfare
  40: { competitive: 0.4, 'co-op': 0.4, comedic: 0.4 }, // Party
  41: { strategy: 1, methodical: 0.6, 'slow-burn': 0.3 }, // 4X (explore, expand, exploit, and exterminate)
  42: { romance: 0.3 }, // Erotic
  43: { mystery: 1 }, // Mystery
  44: { romance: 1 }, // Romance
};

/** Curated high-signal IGDB keywords (not exhaustive; `perch vocab:check` lists the gaps). */
export const KEYWORD_MAP: IgdbMap = {
  // forms
  416: { roguelike: 1 }, // roguelike
  17292: { roguelike: 0.8 }, // roguelite
  578: { roguelike: 0.5, challenging: 0.4 }, // permadeath
  577: { roguelike: 0.3 }, // procedural generation
  477: { metroidvania: 1, exploration: 0.5 }, // metroidvania
  17326: { challenging: 0.8, action: 0.5, dark: 0.4 }, // soulslike
  58746: { challenging: 0.8, action: 0.5, dark: 0.4 }, // souls-like
  905: { challenging: 0.8 }, // difficult
  3486: { action: 0.4, challenging: 0.3 }, // boss fight
  911: { 'fast-paced': 0.7, challenging: 0.5, action: 0.5 }, // bullet hell
  54851: { 'open-world': 1 }, // open-world
  72: { exploration: 1 }, // exploration
  32041: { exploration: 0.8 }, // world exploration
  510: { survival: 0.4, management: 0.4 }, // crafting
  1905: { management: 0.8, sandbox: 0.3 }, // base building
  3533: { management: 0.8, strategy: 0.4 }, // city builder
  994: { management: 0.8 }, // management
  606: { management: 0.6, strategy: 0.5 }, // resource management
  12950: { management: 0.6, methodical: 0.4 }, // automation
  41972: { management: 0.5, methodical: 0.4 }, // factory
  58621: { management: 0.7, survival: 0.3 }, // colony management
  2793: { strategy: 0.7 }, // base defense
  77: { strategy: 0.8 }, // tower defense
  415: { strategy: 0.5, methodical: 0.6 }, // turn-based
  2399: { strategy: 0.5, methodical: 0.6 }, // turn-based combat
  56983: { strategy: 0.7, methodical: 0.5 }, // tactics
  52703: { strategy: 0.7, roguelike: 0.2 }, // deck building
  54521: { strategy: 0.7, roguelike: 0.2 }, // deckbuilding
  27510: { strategy: 0.7 }, // auto battler
  4527: { puzzle: 0.6, platformer: 0.7 }, // puzzle platformer
  1140: { puzzle: 0.3 }, // hidden object
  23560: { puzzle: 0.8, mystery: 0.4 }, // escape room
  988: { 'co-op': 1 }, // online co-op
  1635: { 'co-op': 1 }, // local co-op
  17120: { 'co-op': 0.8 }, // teamwork
  286: { competitive: 1 }, // competitive
  546: { competitive: 0.9 }, // pvp
  1655: { competitive: 0.9 }, // esports
  26519: { shooter: 0.8, action: 0.6 }, // looter shooter
  38683: { 'high-tension': 0.7, shooter: 0.5, survival: 0.4 }, // extraction
  1836: { horror: 1, survival: 0.7, 'high-tension': 0.8 }, // survival horror
  // themes
  953: { mythology: 1 }, // mythology
  35: { mythology: 0.6 }, // greek mythology
  367: { mythology: 0.6 }, // norse mythology
  537: { fantasy: 0.8, dark: 0.8 }, // dark fantasy
  151: { historical: 0.6, fantasy: 0.3 }, // medieval
  211: { supernatural: 0.8, dark: 0.5 }, // vampire
  1069: { supernatural: 0.7, dark: 0.6 }, // demons
  16: { supernatural: 0.8 }, // ghosts
  1105: { supernatural: 1 }, // supernatural
  1295: { horror: 0.8, dark: 0.7, supernatural: 0.6 }, // lovecraftian
  131: { horror: 1, 'high-tension': 0.7, dark: 0.7 }, // psychological horror
  5: { horror: 0.7, 'post-apocalyptic': 0.4, survival: 0.4 }, // zombies
  55505: { horror: 0.7, 'post-apocalyptic': 0.4, survival: 0.4 }, // zombie
  69: { 'post-apocalyptic': 1, survival: 0.4, dark: 0.4 }, // post-apocalyptic
  1317: { 'post-apocalyptic': 0.8 }, // apocalypse
  429: { dark: 0.6, 'sci-fi': 0.4 }, // dystopian
  103: { cyberpunk: 1, 'sci-fi': 0.8 }, // cyberpunk
  1440: { 'sci-fi': 0.5 }, // artificial intelligence
  575: { 'sci-fi': 0.6 }, // robots
  3: { 'sci-fi': 0.7 }, // aliens
  974: { 'sci-fi': 0.8, exploration: 0.4 }, // space
  170: { 'sci-fi': 0.7 }, // time travel
  2158: { 'sci-fi': 0.4, puzzle: 0.3 }, // time loop
  243: { heist: 1, crime: 0.7, stealth: 0.4 }, // heist
  1669: { crime: 1 }, // crime
  3137: { crime: 0.8 }, // mafia
  1560: { crime: 0.8 }, // gangster
  1136: { mystery: 0.5, crime: 0.4, dark: 0.4 }, // noir
  215: { mystery: 0.9, crime: 0.4 }, // detective
  225: { mystery: 0.8 }, // investigation
  1638: { mystery: 0.6, dark: 0.4 }, // conspiracy
  1107: { war: 1 }, // war
  563: { war: 0.8 }, // military
  58250: { war: 0.8, historical: 0.8 }, // world war ii
  8: { war: 0.7, historical: 0.6 }, // cold war
  1632: { exploration: 0.5, relaxed: 0.3 }, // sailing
  // mood / pacing / story
  24685: { cozy: 1, relaxed: 0.7, wholesome: 0.6 }, // cozy
  23931: { wholesome: 1, cozy: 0.5 }, // wholesome
  2084: { relaxed: 1, cozy: 0.4 }, // relaxing
  57715: { relaxed: 1 }, // relaxation
  1103: { cozy: 0.7, relaxed: 0.6, management: 0.4 }, // farming
  976: { cozy: 0.6, relaxed: 0.6 }, // gardening
  43: { cozy: 0.4, relaxed: 0.4 }, // life simulation
  1387: { whimsical: 0.6, wholesome: 0.4 }, // cute
  1511: { comedic: 1 }, // funny
  1754: { comedic: 0.6, dark: 0.4 }, // dark humor
  413: { comedic: 0.7 }, // parody
  1539: { comedic: 0.6 }, // satire
  1697: { atmospheric: 1 }, // atmospheric
  2202: { emotional: 1 }, // emotional
  423: { dark: 0.7, atmospheric: 0.4 }, // gothic
  42165: { melancholic: 1, emotional: 0.4 }, // melancholy
  5411: { melancholic: 0.8, dark: 0.4, emotional: 0.4 }, // depression
  51417: { melancholic: 0.7, emotional: 0.3 }, // loneliness
  2500: { melancholic: 0.6, emotional: 0.5, dark: 0.3 }, // tragedy
  2426: { 'story-rich': 1, 'slow-burn': 0.3 }, // story rich
  17268: { 'story-rich': 0.7 }, // narrative
  3534: { 'story-rich': 0.6 }, // choices matter
  1313: { 'story-rich': 0.5 }, // multiple endings
  1493: { 'story-rich': 0.6, exploration: 0.5, 'slow-burn': 0.5, relaxed: 0.4 }, // walking simulator
  9181: { 'found-family': 0.9, wholesome: 0.4 }, // friendship
  47272: { romance: 0.8 }, // love
  43508: { romance: 0.9, 'story-rich': 0.5 }, // dating sim

  // tuning 2026-11-16
  129: { dark: 0.3 }, // bloody
  4891: { action: 0.3 }, // melee
  5308: { rpg: 0.4 }, // rpg elements
  4284: { rpg: 0.4 }, // leveling up
  4852: { rpg: 0.2, exploration: 0.2 }, // side quests
  4397: { rpg: 0.2 }, // upgradeable weapons
  1289: { metroidvania: 0.3, exploration: 0.3 }, // backtracking
  226: { fantasy: 0.3 }, // magic
  5963: { 'story-rich': 0.4, mystery: 0.3 }, // plot twist
  221: { crime: 0.3, dark: 0.3 }, // murder
  4850: { 'story-rich': 0.5 }, // moral decisions
  4998: { 'story-rich': 0.3 }, // betrayal
  1186: { 'story-rich': 0.3 }, // multiple protagonists
  1320: { dark: 0.3, supernatural: 0.3 }, // undead
  3203: { dark: 0.4, atmospheric: 0.3 }, // darkness
  5999: { stealth: 0.6 }, // stealth kill
  22: { stealth: 0.4 }, // assassin
  1403: { management: 0.3 }, // building
  2324: { exploration: 0.1 }, // swimming
};

/** IGDB player_perspectives (1 = First person). */
export const PERSPECTIVE_MAP: IgdbMap = {
  1: { 'first-person': 1 }, // First person
};
