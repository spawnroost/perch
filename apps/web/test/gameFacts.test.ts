import { describe, expect, it } from 'vitest';
import {
  aboutRows,
  coopLabels,
  criticSummary,
  externalUrl,
  steamReviewsSummary,
  storeLabel,
} from '../src/lib/gameFacts.js';

const noCoop = {
  campaign: false,
  online: false,
  onlineMax: null,
  local: false,
  splitscreen: false,
};

describe('criticSummary', () => {
  it('shows the score and a pluralised critic count', () => {
    expect(criticSummary({ score: 92, count: 41 })).toEqual({ score: '92', caption: '41 critics' });
    expect(criticSummary({ score: 80, count: 1 })).toEqual({ score: '80', caption: '1 critic' });
    expect(criticSummary({ score: 88, count: 1234 })?.caption).toBe('1,234 critics');
  });
  it('falls back to a plain caption without a count, null without data', () => {
    expect(criticSummary({ score: 70, count: null })).toEqual({ score: '70', caption: 'Critics' });
    expect(criticSummary(null)).toBeNull();
  });
});

describe('steamReviewsSummary', () => {
  it('formats percent and total and links the Steam reviews page', () => {
    expect(steamReviewsSummary({ desc: 'Very Positive', pct: 96, total: 123456 }, 1145360)).toEqual(
      {
        desc: 'Very Positive',
        score: '96%',
        total: '123,456 reviews',
        url: 'https://store.steampowered.com/app/1145360#app_reviews_hash',
      },
    );
  });
  it('has no link without a Steam app id and singularises one review', () => {
    const s = steamReviewsSummary({ desc: 'Positive', pct: 100, total: 1 }, null);
    expect(s?.url).toBeNull();
    expect(s?.total).toBe('1 review');
  });
  it('is null with no data', () => {
    expect(steamReviewsSummary(null, 5)).toBeNull();
  });
});

describe('storeLabel', () => {
  it('names every store', () => {
    expect(storeLabel('steam')).toBe('Steam');
    expect(storeLabel('gog')).toBe('GOG');
    expect(storeLabel('epic')).toBe('Epic Games');
    expect(storeLabel('app-store')).toBe('App Store');
    expect(storeLabel('google-play')).toBe('Google Play');
  });
});

describe('externalUrl', () => {
  it('keeps http(s) urls and drops anything else', () => {
    expect(externalUrl('https://store.steampowered.com/app/1')).toBe(
      'https://store.steampowered.com/app/1',
    );
    expect(externalUrl('javascript:alert(1)')).toBeNull();
    expect(externalUrl('not a url')).toBeNull();
  });
});

describe('coopLabels', () => {
  it('lists only the true flags', () => {
    expect(coopLabels(null)).toEqual([]);
    expect(coopLabels(noCoop)).toEqual([]);
    expect(coopLabels({ ...noCoop, splitscreen: true })).toEqual(['Split-screen']);
    expect(
      coopLabels({ campaign: true, online: true, onlineMax: 4, local: true, splitscreen: true }),
    ).toEqual(['Campaign co-op', 'Online co-op up to 4', 'Local co-op', 'Split-screen']);
  });
  it('says plain online co-op without a known player cap', () => {
    expect(coopLabels({ ...noCoop, online: true })).toEqual(['Online co-op']);
    expect(coopLabels({ ...noCoop, online: true, onlineMax: 1 })).toEqual(['Online co-op']);
  });
});

describe('aboutRows', () => {
  const empty = {
    developers: [],
    publishers: [],
    modes: [],
    perspectives: [],
    coop: null,
    dlcCount: 0,
    expansionCount: 0,
    series: null,
  };
  it('is empty with no data', () => {
    expect(aboutRows(empty)).toEqual([]);
  });
  it('builds labelled rows in a fixed order and skips empty ones', () => {
    expect(
      aboutRows({
        developers: ['Supergiant Games'],
        publishers: ['Supergiant Games', 'Private Division'],
        modes: ['Single player'],
        perspectives: ['Bird view / Isometric'],
        coop: { ...noCoop, online: true, onlineMax: 4 },
        dlcCount: 1,
        expansionCount: 2,
        series: 'Hades',
      }),
    ).toEqual([
      { label: 'Developer', value: 'Supergiant Games' },
      { label: 'Publishers', value: 'Supergiant Games, Private Division' },
      { label: 'Series', value: 'Hades' },
      { label: 'Modes', value: 'Single player' },
      { label: 'Perspective', value: 'Bird view / Isometric' },
      { label: 'Co-op', value: 'Online co-op up to 4' },
      { label: 'Extras', value: '1 DLC, 2 expansions' },
    ]);
  });
  it('pluralises developers and omits zero counts', () => {
    const rows = aboutRows({
      ...empty,
      developers: ['A', 'B'],
      expansionCount: 1,
    });
    expect(rows).toEqual([
      { label: 'Developers', value: 'A, B' },
      { label: 'Extras', value: '1 expansion' },
    ]);
  });
});
