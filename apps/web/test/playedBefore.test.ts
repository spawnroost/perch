import { describe, expect, it } from 'vitest';
import type { PlayedBefore } from '@perch/core/browser';
import {
  playedBeforeDetail,
  playedBeforeHeading,
  selectedIds,
  resolveBodies,
  toggleSelected,
  unselectedIds,
} from '../src/lib/playedBefore.js';

const e = (id: string, minutes: number | null, lastPlayed: string | null = null): PlayedBefore => ({
  entryId: id,
  title: `Game ${id}`,
  minutes,
  lastPlayed,
});

describe('playedBeforeHeading', () => {
  it('counts the games and agrees with the number', () => {
    expect(playedBeforeHeading(1)).toBe("You've played 1 of these before");
    expect(playedBeforeHeading(12)).toBe("You've played 12 of these before");
  });
});

describe('playedBeforeDetail', () => {
  it('shows hours and the last played date, whichever are known', () => {
    expect(playedBeforeDetail(e('a', 90, '2020-01-05T00:00:00.000Z'))).toBe('1.5 h · 5 Jan 2020');
    expect(playedBeforeDetail(e('a', 6000))).toBe('100 h');
    expect(playedBeforeDetail(e('a', null, '2020-01-05T00:00:00.000Z'))).toBe('5 Jan 2020');
    expect(playedBeforeDetail(e('a', null))).toBe('');
  });
});

describe('selection', () => {
  const list = [e('a', 60), e('b', 120), e('c', 180)];
  it('starts with everything checked: the checked ones are what Paused applies to', () => {
    expect(selectedIds(list, new Set())).toEqual(['a', 'b', 'c']);
  });
  it('unchecking is kept as a set of cleared ids', () => {
    const cleared = toggleSelected(new Set(), 'b');
    expect(selectedIds(list, cleared)).toEqual(['a', 'c']);
    expect(selectedIds(list, toggleSelected(cleared, 'b'))).toEqual(['a', 'b', 'c']);
  });
  it('the unchecked ones are the complement', () => {
    expect(unselectedIds(list, toggleSelected(new Set(), 'b'))).toEqual(['b']);
    expect(unselectedIds(list, new Set())).toEqual([]);
  });
  it('does not mutate the previous set', () => {
    const before = new Set<string>();
    toggleSelected(before, 'a');
    expect(before.size).toBe(0);
  });
});

describe('resolveBodies', () => {
  const ids = (n: number, p: string) => Array.from({ length: n }, (_, i) => `${p}${i}`);
  it('is one request when both lists fit', () => {
    expect(resolveBodies(['a'], ['b', 'c'])).toEqual([{ pausedIds: ['a'], keptIds: ['b', 'c'] }]);
    expect(resolveBodies([], ids(3, 'k'))).toEqual([{ pausedIds: [], keptIds: ids(3, 'k') }]);
  });
  it('splits long lists so no request is over the limit and no id is lost or repeated', () => {
    const paused = ids(12, 'p');
    const kept = ids(3, 'k');
    const bodies = resolveBodies(paused, kept, 5);
    expect(bodies.map((b) => [b.pausedIds.length, b.keptIds.length])).toEqual([
      [5, 3],
      [5, 0],
      [2, 0],
    ]);
    expect(bodies.flatMap((b) => b.pausedIds)).toEqual(paused);
    expect(bodies.flatMap((b) => b.keptIds)).toEqual(kept);
  });
  it('is nothing for nothing', () => {
    expect(resolveBodies([], [])).toEqual([]);
  });
});
