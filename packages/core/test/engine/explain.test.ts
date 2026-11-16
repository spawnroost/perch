import { describe, expect, it } from 'vitest';
import { createNoneProvider } from '../../src/engine/explain.js';
import { buildProfile } from '../../src/engine/profile.js';
import { CANDIDATES, LIBRARY, NOW } from './fixtures.js';

const labels = {
  roguelike: 'Roguelike',
  mythology: 'Mythology',
  action: 'Action',
  'fast-paced': 'Fast-paced',
};
const profile = buildProfile({ library: LIBRARY, feedback: [], now: NOW });
const library = LIBRARY.map((l) => l.game);

describe('none explain provider', () => {
  const provider = createNoneProvider({ labels });

  it('names the closest library game and the shared vocab labels', async () => {
    const odyssey = CANDIDATES.find((g) => g.igdbId === 102)!;
    const [reason] = await provider.explain([{ game: odyssey, profile, library }]);
    expect(reason).toMatch(/^Similar to Hades: /);
    const shared = reason!.split(': ')[1]!.split(', ');
    expect(shared.length).toBeGreaterThanOrEqual(2);
    expect(shared.length).toBeLessThanOrEqual(3);
    expect(shared).toContain('Roguelike');
    expect(shared).toContain('Mythology');
  });

  it('falls back to the vocab id when there is no label', async () => {
    const [reason] = await createNoneProvider({ labels: {} }).explain([
      { game: CANDIDATES[1]!, profile, library },
    ]);
    expect(reason).toContain('roguelike');
  });

  it('handles a game with nothing in common', async () => {
    const [reason] = await provider.explain([
      { game: { ...CANDIDATES[0]!, vocab: { unknown: 1 } }, profile, library },
    ]);
    expect(reason).toBe('Matches your overall taste profile');
  });

  it('never names the game itself (backlog games are in the library)', async () => {
    const hades = LIBRARY[0]!.game;
    const [reason] = await provider.explain([{ game: hades, profile, library }]);
    expect(reason).not.toContain('Similar to Hades');
    expect(reason).toMatch(/^Similar to /);
  });

  it('returns one reason per request, in order', async () => {
    const reasons = await provider.explain(
      CANDIDATES.slice(0, 4).map((game) => ({ game, profile, library })),
    );
    expect(reasons).toHaveLength(4);
  });
});
