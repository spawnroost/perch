import { describe, expect, it } from 'vitest';
import { formatTrackTime, playableTracks } from '../src/lib/soundtrack.js';

describe('formatTrackTime', () => {
  it('formats m:ss', () => {
    expect(formatTrackTime(0)).toBe('0:00');
    expect(formatTrackTime(44568)).toBe('0:45');
    expect(formatTrackTime(257735)).toBe('4:18');
    expect(formatTrackTime(3_601_000)).toBe('60:01');
  });
  it('is empty without a duration', () => {
    expect(formatTrackTime(null)).toBe('');
  });
});

describe('playableTracks', () => {
  const t = (n: number, previewUrl: string | null) => ({
    name: `T${n}`,
    number: n,
    durationMs: 1000,
    previewUrl,
  });
  it('keeps tracks, marks https previews playable and drops other schemes', () => {
    const rows = playableTracks([t(1, 'https://p/1.m4a'), t(2, null), t(3, 'javascript:alert(1)')]);
    expect(rows.map((r) => r.preview)).toEqual(['https://p/1.m4a', null, null]);
    expect(rows).toHaveLength(3);
  });
});
