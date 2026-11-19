import { describe, expect, it, vi } from 'vitest';
import { GOG_SOURCE_ID, type IgdbClient, type NamedGame } from '../../src/index.js';
import {
  resolveExactNames,
  resolveExportGames,
  type ExportGame,
} from '../../src/library-export/index.js';
import { resolveExportGames as resolveFromRoot } from '../../src/index.js';

const named = (igdbId: number, name: string, gameType: number | null, year: number | null) =>
  ({
    igdbId,
    name,
    gameType,
    firstRelease: year ? new Date(Date.UTC(year, 0, 1)) : null,
  }) satisfies NamedGame;

function stub(opts: { gog?: Record<string, number>; names?: NamedGame[] }) {
  const externalGameIds = vi.fn(async (_s: number, uids: readonly string[]) => {
    const m = new Map<string, number>();
    for (const u of uids) if (opts.gog?.[u]) m.set(u, opts.gog[u]!);
    return m;
  });
  const gamesByExactName = vi.fn(async (names: readonly string[]) =>
    (opts.names ?? []).filter((n) => names.includes(n.name)),
  );
  return { externalGameIds, gamesByExactName } satisfies Pick<
    IgdbClient,
    'externalGameIds' | 'gamesByExactName'
  >;
}

const g = (source: ExportGame['source'], title: string, storeId?: string): ExportGame => ({
  source,
  title,
  ...(storeId ? { storeId } : {}),
});

describe('resolveExportGames', () => {
  it('is exported from the package root', () => {
    expect(resolveFromRoot).toBe(resolveExportGames);
  });

  it('maps GOG product ids through external_games, the rest by title', async () => {
    const client = stub({
      gog: { '111': 1001 },
      names: [named(2002, 'Celeste', 0, 2018)],
    });
    const out = await resolveExportGames(client, [
      g('gog', 'Hollow Knight', '111'),
      g('epic', 'Celeste', 'Sugar'),
      g('other', 'Nope'),
    ]);
    expect(out).toEqual([1001, 2002, null]);
    expect(client.externalGameIds).toHaveBeenCalledWith(GOG_SOURCE_ID, ['111']);
    expect(client.gamesByExactName).toHaveBeenCalledTimes(1);
    expect(client.gamesByExactName.mock.calls[0]![0]).toEqual(['Celeste', 'Nope']);
  });

  it('falls back to the title when the GOG id is unknown to IGDB', async () => {
    const client = stub({ names: [named(7, 'Hollow Knight', 0, 2017)] });
    const out = await resolveExportGames(client, [g('gog', 'Hollow Knight', '999')]);
    expect(out).toEqual([7]);
  });

  it('prefers main games, then the earliest release, on a name tie', async () => {
    const client = stub({
      names: [
        named(1, 'Doom', 8, 2016), // remake
        named(2, 'Doom', 0, 2016),
        named(3, 'Doom', 0, 1993),
        named(4, 'Doom', 0, null),
      ],
    });
    expect(await resolveExportGames(client, [g('epic', 'Doom')])).toEqual([3]);
  });

  it('prefers the most rated main game over an older namesake', async () => {
    const client = stub({
      names: [
        { ...named(80529, 'Hades', 0, 1995), ratingCount: 3 },
        { ...named(113112, 'Hades', 0, 2020), ratingCount: 900 },
        { ...named(5, 'Hades', 8, 2024), ratingCount: 5000 }, // not a main game
      ],
    });
    expect(await resolveExportGames(client, [g('epic', 'Hades')])).toEqual([113112]);
  });

  it('compares names normalised and queries each distinct title once', async () => {
    const client = stub({ names: [named(5, 'Hades', 0, 2020)] });
    const titles = Array.from({ length: 120 }, (_, i) => g('epic', `T${i}`));
    const out = await resolveExportGames(client, [
      g('epic', 'Hades™'),
      g('other', 'HADES'),
      ...titles,
    ]);
    expect(out[0]).toBeNull(); // "Hades™" is not an exact name; no fuzzy search
    expect(client.gamesByExactName.mock.calls.flatMap((c) => c[0]).length).toBe(122);
  });

  it('matches a case or punctuation variant returned for another spelling', async () => {
    const client = stub({ names: [named(5, 'Hades', 0, 2020)] });
    const out = await resolveExportGames(client, [g('epic', 'Hades'), g('other', 'hades')]);
    expect(out).toEqual([5, 5]);
  });

  it('makes no requests for no games', async () => {
    const client = stub({});
    expect(await resolveExportGames(client, [])).toEqual([]);
    expect(client.externalGameIds).not.toHaveBeenCalled();
    expect(client.gamesByExactName).not.toHaveBeenCalled();
  });
});

describe('resolveExactNames', () => {
  it('keys by normalised title, picks the best namesake, leaves misses out', async () => {
    const client = stub({
      names: [
        { ...named(1, 'Hades', 0, 1995), ratingCount: 2 },
        { ...named(2, 'Hades', 0, 2020), ratingCount: 900 },
      ],
    });
    const out = await resolveExactNames(client, ['Hades', 'Hades', 'Nope']);
    expect(out).toEqual(new Map([['hades', 2]]));
    expect(client.gamesByExactName).toHaveBeenCalledWith(['Hades', 'Nope']);
  });
  it('makes no request for no titles', async () => {
    const client = stub({});
    expect((await resolveExactNames(client, [])).size).toBe(0);
    expect(client.gamesByExactName).not.toHaveBeenCalled();
  });
});
