import { describe, expect, it } from 'vitest';
import { IGDB_GENRES, IGDB_THEMES, browseFacets } from '../../src/browse/facets.js';

describe('browse facets', () => {
  it('lists named IGDB genres and themes with unique ids', () => {
    const { genres, themes } = browseFacets();
    expect(genres).toBe(IGDB_GENRES);
    expect(themes).toBe(IGDB_THEMES);
    expect(genres).toContainEqual({ id: 12, name: 'Role-playing (RPG)' });
    expect(themes).toContainEqual({ id: 17, name: 'Fantasy' });
    for (const list of [genres, themes]) {
      expect(new Set(list.map((f) => f.id)).size).toBe(list.length);
      expect(list.every((f) => f.name.length > 0)).toBe(true);
    }
  });
});
