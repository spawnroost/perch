import { describe, expect, it, vi } from 'vitest';
import { buildCandidates } from '../../src/engine/candidates.js';
import { buildProfile } from '../../src/engine/profile.js';
import { isBacklog } from '../../src/engine/visibility.js';
import { LIBRARY, NOW, game, item } from './fixtures.js';

const mapVocab = (g: { genres: number[] }) => ({ [`g${g.genres[0]}`]: 1 });
const raw = (id: number, extra = {}) => {
  const { vocab, ...rest } = game(id, `Game ${id}`, {}, { genres: [id], ...extra });
  void vocab;
  return rest;
};

function setup(over: Partial<Parameters<typeof buildCandidates>[0]> = {}) {
  const getGames = vi.fn(async (ids: readonly number[]) => ids.map((id) => raw(id)));
  const queryByTags = vi.fn(async () => [raw(500), raw(501)]);
  const library = over.library ?? LIBRARY;
  const profile = buildProfile({ library, feedback: [], now: NOW });
  return {
    getGames,
    queryByTags,
    run: () =>
      buildCandidates({
        profile,
        library,
        hidden: new Set(),
        deps: { getGames, queryByTags, mapVocab },
        now: NOW,
        ...over,
      }),
  };
}

describe('isBacklog', () => {
  const g = game(1, 'A', {});
  it('owned and (status backlog or under 2 h)', () => {
    expect(isBacklog(item(g, 0, null, 'backlog'))).toBe(true);
    expect(isBacklog(item(g, null, null, 'backlog'))).toBe(true);
    expect(isBacklog(item(g, 1.5, 3, 'playing'))).toBe(true);
    expect(isBacklog(item(g, 2, 3, 'playing'))).toBe(false);
    expect(isBacklog(item(g, 40, 3, 'finished'))).toBe(false);
    expect(isBacklog(item(g, 0, null, 'backlog', false))).toBe(false);
  });
});

describe('buildCandidates', () => {
  it('fetches similar_games of the top 10 weighted games, not already in the library', async () => {
    const { run, getGames } = setup();
    await run();
    // Library has 12 games; the top 10 by weight exclude the 2 lowest. Ids 101/102/106/108 come from similarIds.
    const ids = getGames.mock.calls[0]![0] as number[];
    expect(new Set(ids)).toEqual(new Set([101, 102, 106, 108]));
    expect(ids).toHaveLength(4);
  });

  it('queries the top 3 genres and top 3 themes with the rating floor', async () => {
    const { run, queryByTags } = setup();
    await run();
    const q = (queryByTags.mock.calls[0] as unknown[])[0] as {
      genres: number[];
      themes: number[];
      minRatingCount: number;
    };
    expect(q.genres).toHaveLength(3);
    expect(q.themes.slice(0, 3)).toEqual([17, 18]);
    expect(q.minRatingCount).toBe(50);
  });

  it('adds the backlog, dedupes, computes vocab, and flags backlog games', async () => {
    const backlogGame = game(900, 'Waiting', { z: 1 }, { genres: [9] });
    const library = [...LIBRARY, item(backlogGame, 0, null, 'backlog')];
    const { run } = setup({ library });
    const out = await run();
    const ids = out.map((c) => c.game.igdbId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(out.find((c) => c.game.igdbId === 900)).toMatchObject({ backlog: true });
    expect(out.find((c) => c.game.igdbId === 101)).toMatchObject({ backlog: false });
    expect(out.find((c) => c.game.igdbId === 101)!.game.vocab).toEqual({ g101: 1 });
    expect(out.find((c) => c.game.igdbId === 900)!.game.vocab).toEqual({ z: 1 });
    expect(ids).toContain(500);
  });

  it('hides library games (non-backlog) and hidden ids returned by the tag query', async () => {
    const { run, queryByTags } = setup({ hidden: new Set([501]) });
    queryByTags.mockResolvedValue([raw(1), raw(500), raw(501)]); // 1 = Hades, in the library
    const ids = (await run()).map((c) => c.game.igdbId);
    expect(ids).not.toContain(1);
    expect(ids).not.toContain(501);
    expect(ids).toContain(500);
  });

  it('drops a hidden backlog game and unreleased games', async () => {
    const backlogGame = game(900, 'Waiting', { z: 1 });
    const library = [...LIBRARY, item(backlogGame, 0, null, 'backlog')];
    const { run, queryByTags } = setup({ library, hidden: new Set([900]) });
    queryByTags.mockResolvedValue([
      raw(500),
      raw(502, { firstRelease: new Date(NOW.getTime() + 86_400_000) }),
    ]);
    const ids = (await run()).map((c) => c.game.igdbId);
    expect(ids).not.toContain(900);
    expect(ids).not.toContain(502);
    expect(ids).toContain(500);
  });

  it('caps at 300 but keeps every backlog game', async () => {
    const many = Array.from({ length: 400 }, (_, i) => raw(1000 + i));
    const backlog = Array.from({ length: 5 }, (_, i) =>
      item(game(900 + i, `B${i}`, { z: 1 }), 0, null, 'backlog'),
    );
    const { run, queryByTags } = setup({ library: [...LIBRARY, ...backlog] });
    queryByTags.mockResolvedValue(many);
    const out = await run();
    expect(out).toHaveLength(300);
    expect(out.filter((c) => c.backlog)).toHaveLength(5);
  });

  it('skips the network lookups when there is nothing to ask', async () => {
    const { run, getGames, queryByTags } = setup({ library: [] });
    expect(await run()).toEqual([]);
    expect(getGames).not.toHaveBeenCalled();
    expect(queryByTags).not.toHaveBeenCalled();
  });
});
