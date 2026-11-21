import { describe, expect, it } from 'vitest';
import {
  CHEAPSHARK_USER_AGENT,
  CheapSharkQueueFullError,
  createCheapSharkClient,
  getSharedCheapSharkClient,
  pickGameId,
  toPriceInfo,
} from '../../src/prices/index.js';

const stores = [
  { storeID: '1', storeName: 'Steam', isActive: 1 },
  { storeID: '7', storeName: 'GOG', isActive: 1 },
  { storeID: '8', storeName: 'Origin', isActive: 0 },
];
const detail = {
  info: { title: 'Portal 2', steamAppID: '620' },
  cheapestPriceEver: { price: '0.99', date: 1561485700 },
  deals: [
    { storeID: '1', dealID: 'a%2Bb%3D', price: '9.99', retailPrice: '9.99', savings: '0.000000' },
    { storeID: '7', dealID: 'gog1', price: '4.99', retailPrice: '9.99', savings: '50.050050' },
    { storeID: '8', dealID: 'old', price: '0.50', retailPrice: '9.99', savings: '95.0' },
  ],
};

describe('pickGameId', () => {
  const rows = [
    { gameID: '1', steamAppID: '620', external: 'Portal 2' },
    { gameID: '2', steamAppID: '104600', external: 'Portal 2 - The Final Hours' },
    { gameID: '3', steamAppID: null, external: 'Portal: Still Alive' },
  ];
  it('takes the row with the same steam app id', () => {
    expect(pickGameId('steam', rows, { name: 'x', steamAppId: 620 })).toBe('1');
    expect(pickGameId('steam', rows, { name: 'x', steamAppId: 999 })).toBeNull();
  });
  it('matches titles only when they are the same words, never fuzzily', () => {
    expect(pickGameId('title', rows, { name: 'Portal 2', steamAppId: null })).toBe('1');
    expect(pickGameId('title', rows, { name: 'portal™ 2', steamAppId: null })).toBe('1');
    expect(pickGameId('title', rows, { name: 'Portal', steamAppId: null })).toBeNull();
  });
  it('rejects a title match that is another steam app', () => {
    expect(pickGameId('title', rows, { name: 'Portal 2', steamAppId: 12 })).toBeNull();
    expect(pickGameId('title', rows, { name: 'Portal: Still Alive', steamAppId: 12 })).toBe('3');
  });
  it('is null when two rows tie on the title', () => {
    const dup = [
      { gameID: '8', steamAppID: null, external: 'Same' },
      { gameID: '9', steamAppID: null, external: 'Same' },
    ];
    expect(pickGameId('title', dup, { name: 'Same', steamAppId: null })).toBeNull();
  });
});

describe('toPriceInfo', () => {
  it('picks the cheapest active-store deal and the historic low', () => {
    const info = toPriceInfo(detail, stores);
    expect(info).toEqual({
      currency: 'USD',
      best: {
        store: 'GOG',
        price: 4.99,
        retailPrice: 9.99,
        savingsPct: 50,
        url: 'https://www.cheapshark.com/redirect?dealID=gog1',
      },
      historicLow: { price: 0.99, date: '2019-06-25T18:01:40.000Z' },
    });
  });
  it('keeps the dealID as sent (already percent-encoded)', () => {
    const one = { ...detail, deals: [detail.deals[0]!] };
    expect(toPriceInfo(one, stores)!.best!.url).toBe(
      'https://www.cheapshark.com/redirect?dealID=a%2Bb%3D',
    );
  });
  it('has no best offer without deals but keeps the historic low', () => {
    const info = toPriceInfo({ ...detail, deals: [] }, stores);
    expect(info!.best).toBeNull();
    expect(info!.historicLow!.price).toBe(0.99);
  });
  it('is null when there is neither', () => {
    expect(toPriceInfo({ deals: [] }, stores)).toBeNull();
  });
  it('falls back to a generic store name and ignores unusable rows', () => {
    const info = toPriceInfo(
      {
        deals: [
          { storeID: '99', dealID: 'd', price: 'abc', retailPrice: '5', savings: '0' },
          { storeID: '99', dealID: 'e', price: '3', retailPrice: '5', savings: '40' },
        ],
      },
      null,
    );
    expect(info!.best).toMatchObject({ store: 'Store 99', price: 3, savingsPct: 40 });
    expect(info!.historicLow).toBeNull();
  });
  it('is not on sale when the retail price is not above the price', () => {
    const info = toPriceInfo(
      { deals: [{ storeID: '1', dealID: 'z', price: '5', retailPrice: '5', savings: '0.2' }] },
      stores,
    );
    expect(info!.best!.savingsPct).toBe(0);
  });
});

describe('createCheapSharkClient', () => {
  function stub(routes: Record<string, unknown>, status = 200) {
    const calls: { url: URL; ua: string | null }[] = [];
    const fetchFn = (async (u: string, init?: RequestInit) => {
      const url = new URL(String(u));
      calls.push({ url, ua: new Headers(init?.headers).get('user-agent') });
      const key = url.pathname.split('/').pop()! + (url.searchParams.has('id') ? '#id' : '');
      return new Response(JSON.stringify(routes[key] ?? []), { status });
    }) as unknown as typeof fetch;
    return {
      calls,
      client: createCheapSharkClient({ fetch: fetchFn, sleep: async () => {}, retries: 0 }),
    };
  }
  const steamRows = [{ gameID: '36', steamAppID: '620', external: 'Portal 2' }];

  it('looks up by steam app id, then fetches the game with a descriptive user agent', async () => {
    const s = stub({ games: steamRows, 'games#id': detail, stores });
    const info = await s.client.findPrices({ name: 'Portal 2', steamAppId: 620 });
    expect(info!.best!.store).toBe('GOG');
    const paths = s.calls.map((c) => c.url.pathname + c.url.search);
    expect(paths[0]).toBe('/api/1.0/games?steamAppID=620');
    expect(s.calls.every((c) => c.ua === CHEAPSHARK_USER_AGENT)).toBe(true);
    expect(CHEAPSHARK_USER_AGENT).toMatch(/^Perch\//);
    expect(s.calls.some((c) => c.url.searchParams.get('id') === '36')).toBe(true);
    expect(s.calls.some((c) => c.url.pathname.endsWith('/stores'))).toBe(true);
  });

  it('falls back to an exact title when the steam id finds nothing', async () => {
    const calls: string[] = [];
    const fetchFn = (async (u: string) => {
      const url = new URL(String(u));
      calls.push(url.pathname + url.search);
      let body: unknown = [];
      if (url.searchParams.get('title')) body = steamRows;
      else if (url.searchParams.get('id')) body = detail;
      else if (url.pathname.endsWith('/stores')) body = stores;
      return new Response(JSON.stringify(body));
    }) as unknown as typeof fetch;
    const client = createCheapSharkClient({ fetch: fetchFn, sleep: async () => {}, retries: 0 });
    expect(await client.findPrices({ name: 'Portal 2', steamAppId: 620 })).not.toBeNull();
    expect(calls[0]).toBe('/api/1.0/games?steamAppID=620');
    expect(calls[1]).toContain('title=Portal+2');
  });

  it('does not guess: no exact title match is null', async () => {
    const s = stub({ games: [{ gameID: '5', steamAppID: null, external: 'Portal 2 Deluxe' }] });
    expect(await s.client.findPrices({ name: 'Portal 2', steamAppId: null })).toBeNull();
  });

  it('names a title-only lookup without a steam id request', async () => {
    const s = stub({ games: steamRows, 'games#id': detail, stores });
    await s.client.findPrices({ name: 'Portal 2', steamAppId: null });
    expect(s.calls[0]!.url.searchParams.get('title')).toBe('Portal 2');
    expect(s.calls[0]!.url.searchParams.has('steamAppID')).toBe(false);
  });

  it('loads the store list once', async () => {
    const s = stub({ games: steamRows, 'games#id': detail, stores });
    await s.client.findPrices({ name: 'Portal 2', steamAppId: 620 });
    await s.client.findPrices({ name: 'Portal 2', steamAppId: 620 });
    expect(s.calls.filter((c) => c.url.pathname.endsWith('/stores'))).toHaveLength(1);
  });

  it('still prices when the store list fails', async () => {
    const fetchFn = (async (u: string) => {
      const url = new URL(String(u));
      if (url.pathname.endsWith('/stores')) return new Response('no', { status: 500 });
      return new Response(JSON.stringify(url.searchParams.get('id') ? detail : steamRows));
    }) as unknown as typeof fetch;
    const client = createCheapSharkClient({ fetch: fetchFn, sleep: async () => {}, retries: 0 });
    const info = await client.findPrices({ name: 'Portal 2', steamAppId: 620 });
    expect(info!.best!.price).toBe(0.5);
    expect(info!.best!.store).toBe('Store 8');
  });

  it('throws on an HTTP error so the cache can back off', async () => {
    const s = stub({}, 503);
    await expect(s.client.findPrices({ name: 'Portal 2', steamAppId: 620 })).rejects.toThrow(/503/);
  });

  it('retries a 429 once the wait has passed', async () => {
    let n = 0;
    const slept: number[] = [];
    const fetchFn = (async (u: string) => {
      const url = new URL(String(u));
      if (url.pathname.endsWith('/stores')) return new Response(JSON.stringify(stores));
      if (++n === 1)
        return new Response('slow down', { status: 429, headers: { 'retry-after': '2' } });
      return new Response(JSON.stringify(url.searchParams.get('id') ? detail : steamRows));
    }) as unknown as typeof fetch;
    const client = createCheapSharkClient({
      fetch: fetchFn,
      sleep: async (ms) => void slept.push(ms),
      retries: 1,
    });
    expect(await client.findPrices({ name: 'Portal 2', steamAppId: 620 })).not.toBeNull();
    expect(slept.some((ms) => ms >= 2000)).toBe(true);
  });

  it('skips lookups once the queue is full, then recovers', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const fetchFn = (async () => {
      await gate;
      return new Response('[]');
    }) as unknown as typeof fetch;
    const client = createCheapSharkClient({ fetch: fetchFn, sleep: async () => {}, maxQueued: 2 });
    const g = { name: 'A', steamAppId: 1 };
    const a = client.findPrices(g);
    const b = client.findPrices(g);
    await expect(client.findPrices(g)).rejects.toBeInstanceOf(CheapSharkQueueFullError);
    release();
    await Promise.all([a, b]);
    await expect(client.findPrices(g)).resolves.toBeNull();
  });

  it('shares one client per process', () => {
    expect(getSharedCheapSharkClient()).toBe(getSharedCheapSharkClient());
  });
});
