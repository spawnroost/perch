import { describe, expect, it } from 'vitest';
import {
  MOOD_OPTIONS,
  RECENT_PICKS_MAX,
  readRecentPicks,
  relaxedNote,
  rememberPick,
  rouletteParams,
  ROULETTE_RECENT_KEY,
} from '../src/lib/roulette.js';

const memory = (initial?: string) => {
  const data = new Map<string, string>(
    initial === undefined ? [] : [[ROULETTE_RECENT_KEY, initial]],
  );
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
};

describe('recent picks', () => {
  it('reads nothing from empty, missing, broken or foreign storage', () => {
    expect(readRecentPicks(memory())).toEqual([]);
    expect(readRecentPicks(null)).toEqual([]);
    expect(readRecentPicks(memory('{oops'))).toEqual([]);
    expect(readRecentPicks(memory('{"a":1}'))).toEqual([]);
    expect(readRecentPicks(memory('[1,"x",2.5,-3,4]'))).toEqual([1, 4]);
  });

  it('remembers the newest first and keeps only the last five', () => {
    const s = memory();
    for (const id of [1, 2, 3, 4, 5, 6]) rememberPick(s, id);
    expect(readRecentPicks(s)).toEqual([6, 5, 4, 3, 2]);
    expect(RECENT_PICKS_MAX).toBe(5);
  });

  it('moves a repeat to the front instead of duplicating it', () => {
    const s = memory();
    for (const id of [1, 2, 3, 2]) rememberPick(s, id);
    expect(readRecentPicks(s)).toEqual([2, 3, 1]);
  });

  it('survives storage that throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    expect(readRecentPicks(broken)).toEqual([]);
    expect(() => rememberPick(broken, 1)).not.toThrow();
  });
});

describe('rouletteParams', () => {
  it('sends only what was chosen', () => {
    expect(rouletteParams({ device: 'all', minutes: null, mood: null }, [])).toEqual({});
  });

  it('adds device, minutes, mood and the exclude list', () => {
    expect(rouletteParams({ device: 'd1', minutes: 30, mood: 'chill' }, [4, 9])).toEqual({
      device: 'd1',
      minutes: 30,
      mood: 'chill',
      exclude: '4,9',
    });
  });
});

describe('MOOD_OPTIONS', () => {
  it('starts with Any, then one chip per mood', () => {
    expect(MOOD_OPTIONS.map((m) => m.id)).toEqual(['any', 'chill', 'intense', 'story', 'quick']);
  });
});

describe('relaxedNote', () => {
  it('says nothing when no filter was dropped', () => {
    expect(relaxedNote(null, 'chill')).toBeNull();
  });
  it('names the mood that was dropped, or the repeats', () => {
    expect(relaxedNote('mood', 'chill')).toMatch(/chill/i);
    expect(relaxedNote('exclude', null)).toMatch(/repeats/i);
  });
  it('says repeats are back on, not that the mood is missing, when its games were all spun', () => {
    const note = relaxedNote('exclude', 'chill')!;
    expect(note).toMatch(/spun through every chill/i);
    expect(note).not.toMatch(/nothing/i);
  });
  it('covers both filters being dropped', () => {
    expect(relaxedNote('both', 'story')).toMatch(/story.*repeats/i);
  });
});
