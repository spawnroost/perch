import type { BrowseFacetsResponse, Facet } from '../schemas/browse.js';

// IGDB ids and names, as verified against the live API (same ids as taste-vocab's maps).

export const IGDB_GENRES: Facet[] = [
  { id: 4, name: 'Fighting' },
  { id: 5, name: 'Shooter' },
  { id: 7, name: 'Music' },
  { id: 8, name: 'Platform' },
  { id: 9, name: 'Puzzle' },
  { id: 10, name: 'Racing' },
  { id: 11, name: 'Real Time Strategy (RTS)' },
  { id: 12, name: 'Role-playing (RPG)' },
  { id: 13, name: 'Simulator' },
  { id: 14, name: 'Sport' },
  { id: 15, name: 'Strategy' },
  { id: 16, name: 'Turn-based strategy (TBS)' },
  { id: 24, name: 'Tactical' },
  { id: 25, name: "Hack and slash/Beat 'em up" },
  { id: 31, name: 'Adventure' },
  { id: 32, name: 'Indie' },
  { id: 33, name: 'Arcade' },
  { id: 34, name: 'Visual Novel' },
  { id: 35, name: 'Card & Board Game' },
  { id: 36, name: 'MOBA' },
  { id: 2, name: 'Point-and-click' },
  { id: 26, name: 'Quiz/Trivia' },
  { id: 30, name: 'Pinball' },
];

export const IGDB_THEMES: Facet[] = [
  { id: 1, name: 'Action' },
  { id: 17, name: 'Fantasy' },
  { id: 18, name: 'Science fiction' },
  { id: 19, name: 'Horror' },
  { id: 20, name: 'Thriller' },
  { id: 21, name: 'Survival' },
  { id: 22, name: 'Historical' },
  { id: 23, name: 'Stealth' },
  { id: 27, name: 'Comedy' },
  { id: 28, name: 'Business' },
  { id: 31, name: 'Drama' },
  { id: 32, name: 'Non-fiction' },
  { id: 33, name: 'Sandbox' },
  { id: 34, name: 'Educational' },
  { id: 35, name: 'Kids' },
  { id: 38, name: 'Open world' },
  { id: 39, name: 'Warfare' },
  { id: 40, name: 'Party' },
  { id: 41, name: '4X' },
  { id: 43, name: 'Mystery' },
  { id: 44, name: 'Romance' },
];

/** The genre and theme chips the browse page offers (erotic is left out on purpose). */
export function browseFacets(): BrowseFacetsResponse {
  return { genres: IGDB_GENRES, themes: IGDB_THEMES };
}
