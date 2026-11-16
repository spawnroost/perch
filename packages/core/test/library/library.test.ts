import { describe, expect, it } from 'vitest';
import {
  addArgsSchema,
  buildGameRow,
  buildLibraryRow,
  normaliseName,
  parseImportFile,
  parseImportLine,
  pickBestMatch,
  userCreateSchema,
  type Game,
  type GameCandidate,
} from '../../src/index.js';

const cand = (igdbId: number, name: string, ratingCount: number): GameCandidate => ({
  igdbId,
  name,
  slug: null,
  ratingCount,
  firstRelease: null,
});

describe('normaliseName', () => {
  it('lowercases, strips punctuation, diacritics, marks and leading "the"', () => {
    expect(normaliseName('The Hollow  Knight™')).toBe('hollow knight');
    expect(normaliseName('Pokémon: Red')).toBe('pokemon red');
    expect(normaliseName('  HADES ')).toBe('hades');
  });
});

describe('pickBestMatch', () => {
  const results = [
    cand(1, 'Hades II', 900),
    cand(2, 'Hades', 40),
    cand(3, 'Hades', 1500),
    cand(4, 'Hades: Battle Out of Hell', 5000),
  ];
  it('prefers exact normalised name, then highest rating count', () => {
    expect(pickBestMatch('hades', results).match?.igdbId).toBe(3);
  });
  it('matches ignoring punctuation and case', () => {
    expect(pickBestMatch('HADES!', results).match?.igdbId).toBe(3);
  });
  it('returns no match plus the top 3 suggestions when nothing matches exactly', () => {
    const r = pickBestMatch('Hade', results);
    expect(r.match).toBeNull();
    expect(r.suggestions).toEqual([
      { igdbId: 4, name: 'Hades: Battle Out of Hell', year: null },
      { igdbId: 3, name: 'Hades', year: null },
      { igdbId: 1, name: 'Hades II', year: null },
    ]);
  });
  it('includes the release year in suggestions', () => {
    const c = { ...cand(9, 'Other', 5), firstRelease: new Date('2020-09-17T00:00:00Z') };
    expect(pickBestMatch('x', [c]).suggestions?.[0]?.year).toBe(2020);
  });
  it('handles no candidates', () => {
    expect(pickBestMatch('x', [])).toEqual({ match: null, suggestions: [] });
  });
});

describe('parseImportLine', () => {
  it('returns null for blanks and comments', () => {
    expect(parseImportLine('')).toBeNull();
    expect(parseImportLine('   ')).toBeNull();
    expect(parseImportLine('# a comment')).toBeNull();
  });
  it('parses a name only', () => {
    expect(parseImportLine('Hades')).toEqual({ ok: true, value: { name: 'Hades' } });
  });
  it('parses all fields and trailing comments', () => {
    const r = parseImportLine('Hades | 40 | 2026-11-10 | playing');
    expect(r).toEqual({
      ok: true,
      value: {
        name: 'Hades',
        hours: 40,
        lastPlayed: new Date('2026-11-10T00:00:00Z'),
        status: 'playing',
      },
    });
  });
  it('only treats # as a comment at line start', () => {
    expect(parseImportLine('Hitman #2 | 10')).toEqual({
      ok: true,
      value: { name: 'Hitman #2', hours: 10 },
    });
    expect(parseImportLine('  # indented comment')).toBeNull();
    expect(parseImportLine('Hades | 1 # note')?.ok).toBe(false);
  });
  it('allows empty middle fields', () => {
    expect(parseImportLine('Celeste | | | finished')).toEqual({
      ok: true,
      value: { name: 'Celeste', status: 'finished' },
    });
  });
  it('reports bad fields', () => {
    expect(parseImportLine('Hades | lots')?.ok).toBe(false);
    expect(parseImportLine('Hades | 1 | 2026-13-45')?.ok).toBe(false);
    expect(parseImportLine('Hades | 1 | 2026-01-01 | maybe')?.ok).toBe(false);
    expect(parseImportLine('Hades | -3')?.ok).toBe(false);
    expect(parseImportLine('| 3')?.ok).toBe(false);
    expect(parseImportLine('a | 1 | 2026-01-01 | playing | extra')?.ok).toBe(false);
  });
});

describe('parseImportFile', () => {
  it('numbers lines and collects errors without stopping', () => {
    const { entries, errors } = parseImportFile('# hdr\nHades | 4\n\nBad | x\nCeleste\n');
    expect(entries.map((e) => [e.line, e.value.name])).toEqual([
      [2, 'Hades'],
      [5, 'Celeste'],
    ]);
    expect(errors).toEqual([{ line: 4, error: expect.any(String) }]);
  });
});

describe('addArgsSchema', () => {
  it('applies defaults and coerces', () => {
    const a = addArgsSchema.parse({ name: 'Hades', hours: '40', last: '2026-11-10' });
    expect(a).toMatchObject({ name: 'Hades', hours: 40, platform: 'pc' });
    expect(a.owned).toBeUndefined();
    expect(a.lastPlayed).toEqual(new Date('2026-11-10T00:00:00Z'));
  });
  it('rejects bad input', () => {
    expect(addArgsSchema.safeParse({ name: '' }).success).toBe(false);
    expect(addArgsSchema.safeParse({ name: 'x', hours: 'abc' }).success).toBe(false);
    expect(addArgsSchema.safeParse({ name: 'x', status: 'nope' }).success).toBe(false);
    expect(addArgsSchema.safeParse({ name: 'x', igdb: '0' }).success).toBe(false);
    expect(addArgsSchema.parse({ name: 'x', igdb: '1942' }).igdb).toBe(1942);
  });
});

describe('userCreateSchema', () => {
  it('requires a valid email and defaults the name', () => {
    expect(userCreateSchema.parse({ email: 'A@B.com' })).toEqual({ email: 'a@b.com', name: 'a' });
    expect(userCreateSchema.safeParse({ email: 'nope' }).success).toBe(false);
  });
});

describe('row builders', () => {
  const game: Game = {
    igdbId: 7,
    name: 'Hades',
    slug: 'hades',
    coverUrl: null,
    firstRelease: null,
    genres: [1],
    themes: [],
    keywords: [],
    perspectives: [],
    gameModes: [],
    platforms: [6],
    similarIds: [],
    rating: 90,
    ratingCount: 10,
    steamAppId: null,
  };
  it('buildGameRow adds vocab and fetchedAt', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    expect(buildGameRow(game, { roguelike: 1 }, now)).toEqual({
      ...game,
      vocab: { roguelike: 1 },
      fetchedAt: now,
    });
  });
  it('buildLibraryRow: defaults on insert, only provided fields on update', () => {
    const { insert, update } = buildLibraryRow({
      userId: 'u',
      igdbId: 7,
      platform: 'pc',
      source: 'import',
    });
    expect(insert).toEqual({
      userId: 'u',
      igdbId: 7,
      platform: 'pc',
      hoursPlayed: null,
      lastPlayed: null,
      status: 'backlog',
      source: 'import',
    });
    expect(insert.owned).toBeUndefined();
    expect(update).toEqual({});
  });
  it('buildLibraryRow: owned=false is passed through', () => {
    const { insert, update } = buildLibraryRow({
      userId: 'u',
      igdbId: 7,
      platform: 'pc',
      source: 'manual',
      owned: false,
    });
    expect(insert.owned).toBe(false);
    expect(update).toEqual({ owned: false });
  });
  it('buildLibraryRow: provided fields flow to both', () => {
    const last = new Date('2026-11-10T00:00:00Z');
    const { insert, update } = buildLibraryRow({
      userId: 'u',
      igdbId: 7,
      platform: 'pc',
      source: 'manual',
      hours: 40,
      lastPlayed: last,
      status: 'playing',
      owned: true,
    });
    expect(insert).toMatchObject({
      hoursPlayed: 40,
      lastPlayed: last,
      status: 'playing',
      owned: true,
    });
    expect(update).toEqual({
      hoursPlayed: 40,
      lastPlayed: last,
      status: 'playing',
      owned: true,
    });
  });
});
