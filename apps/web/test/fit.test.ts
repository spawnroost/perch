import { describe, expect, it } from 'vitest';
import { deckDisplay, fitDisplay } from '../src/lib/fit.js';

describe('fitDisplay', () => {
  it('maps every fit status to a label and tone', () => {
    expect(fitDisplay('green')).toEqual({ label: 'Runs well', tone: 'yes' });
    expect(fitDisplay('yellow')).toEqual({ label: 'Runs on low', tone: 'low' });
    expect(fitDisplay('hidden')).toEqual({ label: "Won't run", tone: 'no' });
    expect(fitDisplay('unknown')).toEqual({ label: 'Unknown', tone: 'unknown' });
  });
});

describe('deckDisplay', () => {
  it('maps every deck category to a label and tone', () => {
    expect(deckDisplay('verified')).toEqual({ label: 'Verified', tone: 'yes' });
    expect(deckDisplay('playable')).toEqual({ label: 'Playable', tone: 'low' });
    expect(deckDisplay('unsupported')).toEqual({ label: 'Unsupported', tone: 'no' });
    expect(deckDisplay('unknown')).toEqual({ label: 'Untested', tone: 'unknown' });
  });
});
