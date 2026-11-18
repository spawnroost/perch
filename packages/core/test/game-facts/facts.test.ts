import { describe, expect, it } from 'vitest';
import {
  buildGameFacts,
  externalLinks,
  parseStoreWebsites,
  storeLinks,
  STORE_WEBSITE_TYPE,
} from '../../src/game-facts/index.js';

describe('parseStoreWebsites', () => {
  it('maps IGDB website type ids to stores and drops the rest', () => {
    expect(
      parseStoreWebsites([
        { url: 'https://store.steampowered.com/app/1', type: 13 },
        { url: 'https://www.gog.com/game/x', type: 17 },
        { url: 'https://www.epicgames.com/store/x', type: 16 },
        { url: 'https://store.playstation.com/x', type: 23 },
        { url: 'https://www.xbox.com/x', type: 22 },
        { url: 'https://www.nintendo.com/x', type: 24 },
        { url: 'https://apps.apple.com/x', type: 10 },
        { url: 'https://play.google.com/x', type: 12 },
        { url: 'https://x.itch.io/y', type: 15 },
        { url: 'https://example.com', type: 1 }, // official site
        { url: 'https://twitter.com/x', type: 5 },
        { url: 'https://example.com/untyped' },
      ]).map((l) => l.store),
    ).toEqual([
      'steam',
      'gog',
      'epic',
      'playstation',
      'xbox',
      'nintendo',
      'app-store',
      'google-play',
      'itch',
    ]);
  });
  it('maps both App Store ids, ignores non-http urls and handles undefined', () => {
    expect(STORE_WEBSITE_TYPE[10]).toBe('app-store');
    expect(STORE_WEBSITE_TYPE[11]).toBe('app-store');
    expect(parseStoreWebsites(undefined)).toEqual([]);
    expect(parseStoreWebsites([{ url: 'javascript:alert(1)', type: 13 }])).toEqual([]);
  });
});

describe('storeLinks', () => {
  const base = { websites: [], steamAppId: null };
  it('orders stores in a fixed order and keeps one link per store', () => {
    const out = storeLinks({
      steamAppId: null,
      websites: [
        { store: 'itch', url: 'https://a.itch.io/x' },
        { store: 'app-store', url: 'https://apps.apple.com/1' },
        { store: 'app-store', url: 'https://apps.apple.com/1' },
        { store: 'steam', url: 'https://store.steampowered.com/app/9' },
        { store: 'gog', url: 'https://www.gog.com/x' },
        { store: 'gog', url: 'https://www.gog.com/y' },
      ],
    });
    expect(out).toEqual([
      { store: 'steam', url: 'https://store.steampowered.com/app/9' },
      { store: 'gog', url: 'https://www.gog.com/x' },
      { store: 'app-store', url: 'https://apps.apple.com/1' },
      { store: 'itch', url: 'https://a.itch.io/x' },
    ]);
  });
  it('falls back to the Steam store page from the app id', () => {
    expect(storeLinks({ ...base, steamAppId: 1145360 })).toEqual([
      { store: 'steam', url: 'https://store.steampowered.com/app/1145360' },
    ]);
  });
  it('does not add a second Steam link when one exists', () => {
    const out = storeLinks({
      steamAppId: 5,
      websites: [{ store: 'steam', url: 'https://store.steampowered.com/app/5/Name' }],
    });
    expect(out).toEqual([{ store: 'steam', url: 'https://store.steampowered.com/app/5/Name' }]);
  });
  it('is empty with no websites and no Steam app', () => {
    expect(storeLinks(base)).toEqual([]);
  });
});

describe('externalLinks', () => {
  it('builds URL-encoded OpenCritic and Reddit searches', () => {
    expect(externalLinks('Hades & Co: "II"')).toEqual([
      {
        label: 'OpenCritic',
        url: 'https://opencritic.com/search?criteria=Hades%20%26%20Co%3A%20%22II%22',
      },
      {
        label: 'Reddit',
        url: 'https://www.reddit.com/search/?q=Hades%20%26%20Co%3A%20%22II%22',
      },
    ]);
  });
});

describe('buildGameFacts', () => {
  const game = {
    name: 'Hades',
    steamAppId: 1145360,
    websites: [],
    criticRating: 93.529,
    criticRatingCount: 17,
    developers: ['Supergiant'],
    publishers: ['Supergiant'],
    gameModes: [1],
    perspectives: [3],
    multiplayer: null,
    dlcCount: 0,
    expansionCount: 0,
    seriesName: null,
  };
  it('combines critic, Steam reviews, stores and links', () => {
    const f = buildGameFacts(game, { desc: 'Overwhelmingly Positive', pct: 98, total: 200000 });
    expect(f.critic).toEqual({ score: 94, count: 17 });
    expect(f.steamReviews).toEqual({ desc: 'Overwhelmingly Positive', pct: 98, total: 200000 });
    expect(f.stores.map((s) => s.store)).toEqual(['steam']);
    expect(f.links.map((l) => l.label)).toEqual(['OpenCritic', 'Reddit']);
  });
  it('adds the about block and time-to-beat tiers', () => {
    const f = buildGameFacts(game, null, {
      hastilySeconds: 36000,
      normallySeconds: 54000,
      completelySeconds: null,
      count: 9,
    });
    expect(f.about).toMatchObject({ developers: ['Supergiant'], modes: ['Single player'] });
    expect(f.timeToBeat).toEqual({ story: 10, extras: 15, completionist: null, submissions: 9 });
    expect(buildGameFacts(game, null).timeToBeat).toBeNull();
  });
  it('has null critic and reviews when the data is missing', () => {
    const f = buildGameFacts({ ...game, criticRating: null, criticRatingCount: null }, null);
    expect(f.critic).toBeNull();
    expect(f.steamReviews).toBeNull();
  });
  it('keeps a critic score without a count', () => {
    const f = buildGameFacts({ ...game, criticRatingCount: null }, null);
    expect(f.critic).toEqual({ score: 94, count: null });
  });
});
