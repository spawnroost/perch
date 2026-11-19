import { describe, expect, it, vi } from 'vitest';
import {
  fetchTitleHistory,
  lookupXuid,
  XboxGamertagNotFoundError,
  XboxNetworkError,
  XboxNotConfiguredError,
  XboxProfilePrivateError,
  XboxRateLimitedError,
} from '../../src/index.js';

const json = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), init);
const stub = (...replies: (Response | Error)[]) => {
  const fn = vi.fn(async (..._a: Parameters<typeof fetch>) => {
    const next = replies.shift();
    if (!next) throw new Error('unexpected extra request');
    if (next instanceof Error) throw next;
    return next;
  });
  return fn as typeof fn & typeof fetch;
};

const people = (...tags: string[]) => ({
  content: { people: tags.map((t, i) => ({ xuid: `100${i}`, gamertag: t, modernGamertag: t })) },
});
const titles = (...t: object[]) => ({ content: { xuid: '1000', titles: t } });
const game = { titleId: '7', name: 'Hades®', type: 'Game', devices: ['XboxSeries'] };

describe('lookupXuid', () => {
  it('sends the key header and returns the exact (case-insensitive) match, not the first hit', async () => {
    const f = stub(json(people('Major Nelson Fan', 'Major Nelson')));
    const p = await lookupXuid('major nelson', { apiKey: 'k', fetch: f });
    expect(p).toEqual({ xuid: '1001', gamertag: 'Major Nelson' });
    const [url, init] = f.mock.calls[0]!;
    expect(String(url)).toBe('https://xbl.io/api/v2/search/major%20nelson');
    expect(init?.headers).toMatchObject({ 'X-Authorization': 'k', Accept: 'application/json' });
  });

  it('throws not found when no profile matches exactly', async () => {
    await expect(
      lookupXuid('nobody', { apiKey: 'k', fetch: stub(json(people('Nobody2'))) }),
    ).rejects.toBeInstanceOf(XboxGamertagNotFoundError);
    await expect(
      lookupXuid('nobody', { apiKey: 'k', fetch: stub(json({ content: {} })) }),
    ).rejects.toBeInstanceOf(XboxGamertagNotFoundError);
  });

  it('throws not configured without a key, before any request', async () => {
    const f = stub();
    await expect(lookupXuid('x', { apiKey: undefined, fetch: f })).rejects.toBeInstanceOf(
      XboxNotConfiguredError,
    );
    expect(f).not.toHaveBeenCalled();
  });
});

describe('fetchTitleHistory', () => {
  it('returns cleaned games for the xuid', async () => {
    const f = stub(json(titles(game, { titleId: '8', name: 'Netflix', type: 'App' })));
    const out = await fetchTitleHistory('1000', { apiKey: 'k', fetch: f });
    expect(out).toEqual([{ titleId: '7', name: 'Hades', platform: 'xbox', lastPlayed: null }]);
    expect(String(f.mock.calls[0]![0])).toBe('https://xbl.io/api/v2/player/titleHistory/1000');
  });

  it('retries once on an empty body', async () => {
    const f = stub(new Response(''), json(titles(game)));
    expect(await fetchTitleHistory('1', { apiKey: 'k', fetch: f })).toHaveLength(1);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('reports a body that stays empty as private, or as rate limited when the budget is spent', async () => {
    await expect(
      fetchTitleHistory('1', { apiKey: 'k', fetch: stub(new Response(''), new Response('')) }),
    ).rejects.toBeInstanceOf(XboxProfilePrivateError);
    const spent = () => new Response('', { headers: { 'x-ratelimit-remaining': '0' } });
    await expect(
      fetchTitleHistory('1', { apiKey: 'k', fetch: stub(spent(), spent()) }),
    ).rejects.toBeInstanceOf(XboxRateLimitedError);
  });

  it('treats a reply with no titles as a private history', async () => {
    await expect(
      fetchTitleHistory('1', { apiKey: 'k', fetch: stub(json(titles())) }),
    ).rejects.toBeInstanceOf(XboxProfilePrivateError);
  });

  it('maps 429 to rate limited and other failures to network errors', async () => {
    await expect(
      fetchTitleHistory('1', { apiKey: 'k', fetch: stub(new Response('', { status: 429 })) }),
    ).rejects.toBeInstanceOf(XboxRateLimitedError);
    await expect(
      fetchTitleHistory('1', { apiKey: 'k', fetch: stub(new Response('', { status: 500 })) }),
    ).rejects.toMatchObject({ name: 'XboxNetworkError', status: 500 });
    await expect(
      fetchTitleHistory('1', { apiKey: 'k', fetch: stub(new TypeError('fetch failed')) }),
    ).rejects.toBeInstanceOf(XboxNetworkError);
    await expect(
      fetchTitleHistory('1', { apiKey: 'k', fetch: stub(new Response('<html>')) }),
    ).rejects.toBeInstanceOf(XboxNetworkError);
    await expect(
      fetchTitleHistory('1', { apiKey: 'k', fetch: stub(json({ nope: 1 })) }),
    ).rejects.toBeInstanceOf(XboxNetworkError);
  });
});
