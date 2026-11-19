import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { exportGameSchema, parseLibraryExport } from '../../src/library-export/index.js';

const DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../fixtures/library-export');
const file = (name: string) => ({ name, text: readFileSync(resolve(DIR, name), 'utf8') });

describe('parseLibraryExport', () => {
  it('reads Heroic Epic library, skips DLC and duplicates', () => {
    const { games, errors } = parseLibraryExport([file('legendary_library.json')]);
    expect(errors).toEqual([]);
    expect(games).toEqual([
      { source: 'epic', storeId: 'Sugar', title: 'Celeste' },
      { source: 'epic', storeId: 'Min', title: 'Hades' },
    ]);
  });

  it('reads Heroic GOG library with product ids, skipping DLC', () => {
    const { games } = parseLibraryExport([file('gog_library.json')]);
    expect(games).toEqual([
      { source: 'gog', storeId: '1207658924', title: 'The Witcher: Enhanced Edition' },
      { source: 'gog', storeId: '1207666633', title: 'Hollow Knight' },
    ]);
  });

  it('merges timestamp.json playtime by app name, in any file order', () => {
    const { games, errors } = parseLibraryExport([
      file('timestamp.json'),
      file('legendary_library.json'),
      file('gog_library.json'),
    ]);
    expect(errors).toEqual([]);
    expect(games.find((g) => g.title === 'Celeste')).toMatchObject({
      minutesPlayed: 185,
      lastPlayed: '2024-03-05T20:30:00.000Z',
    });
    expect(games.find((g) => g.title === 'Hollow Knight')?.minutesPlayed).toBe(600);
    expect(games.find((g) => g.title === 'Hades')?.minutesPlayed).toBeUndefined();
    expect(games).toHaveLength(4);
  });

  it('reports timestamp.json on its own as having no titles', () => {
    const { games, errors } = parseLibraryExport([file('timestamp.json')]);
    expect(games).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/timestamp\.json.*no titles/i);
  });

  it('reads a Playnite CSV: quoted commas, sources, playtime in seconds', () => {
    const { games, errors } = parseLibraryExport([file('playnite.csv')]);
    expect(errors).toEqual([]);
    expect(games).toEqual([
      {
        source: 'epic',
        title: 'Celeste',
        minutesPlayed: 180,
        lastPlayed: '2024-03-05T20:30:00.000Z',
      },
      { source: 'gog', title: 'Divinity: Original Sin 2, Definitive Edition', minutesPlayed: 600 },
      {
        source: 'other',
        title: 'Stardew Valley',
        minutesPlayed: 120,
        lastPlayed: '2023-01-01T00:00:00.000Z',
      },
      { source: 'epic', title: 'Untitled "Goose" Game' },
    ]);
  });

  it('reads semicolon CSV with h:mm:ss playtime and a platform column', () => {
    const { games } = parseLibraryExport([file('gog-galaxy.csv')]);
    expect(games).toEqual([
      {
        source: 'gog',
        title: 'Cyberpunk 2077',
        minutesPlayed: 7530,
        lastPlayed: '2024-02-01T00:00:00.000Z',
      },
      { source: 'epic', title: 'Control', minutesPlayed: 125 },
    ]);
  });

  it('treats a header containing "hours" as hours', () => {
    const { games } = parseLibraryExport([file('hours.csv')]);
    expect(games).toEqual([
      { source: 'epic', title: 'Hades', minutesPlayed: 750 },
      { source: 'gog', title: 'Inside' },
    ]);
  });

  it('detects by content, not file name', () => {
    const csv = file('playnite.csv');
    const json = file('gog_library.json');
    const { games } = parseLibraryExport([
      { name: 'a.txt', text: csv.text },
      { name: 'b.dat', text: json.text },
    ]);
    expect(games).toHaveLength(6);
  });

  it('dedupes across files by source and store id or normalised title', () => {
    const { games } = parseLibraryExport([
      {
        name: 'a.csv',
        text: 'Name,Source,Playtime\nHades,Epic,60\nhades!,Epic,120\nHades,GOG,0\n',
      },
    ]);
    expect(games).toEqual([
      { source: 'epic', title: 'Hades', minutesPlayed: 2 },
      { source: 'gog', title: 'Hades' },
    ]);
  });

  it('reports bad JSON, unknown JSON and CSVs without a name column', () => {
    const { games, errors } = parseLibraryExport([
      { name: 'bad.json', text: '{"library": [' },
      { name: 'other.json', text: '{"hello": 1}' },
      { name: 'x.csv', text: 'foo,bar\n1,2\n' },
      { name: 'empty.csv', text: '' },
    ]);
    expect(games).toEqual([]);
    expect(errors).toHaveLength(4);
    expect(errors.join('\n')).toMatch(/bad\.json/);
    expect(errors.join('\n')).toMatch(/x\.csv.*name/i);
  });

  it('caps at 5000 games with an error line', () => {
    const rows = Array.from({ length: 5001 }, (_, i) => `Game ${i}`).join('\n');
    const { games, errors } = parseLibraryExport([{ name: 'big.csv', text: `Name\n${rows}` }]);
    expect(games).toHaveLength(5000);
    expect(errors.join()).toMatch(/5000/);
  });

  it('produces games that pass the API schema', () => {
    const { games } = parseLibraryExport([
      file('timestamp.json'),
      file('legendary_library.json'),
      file('playnite.csv'),
    ]);
    for (const g of games) expect(exportGameSchema.safeParse(g).success).toBe(true);
  });
});
