import { describe, expect, it, vi } from 'vitest';
import {
  createDeepseekExplainer,
  REASON_MAX_CHARS,
  type ReasonItem,
} from '../../src/explain/index.js';

const items: ReasonItem[] = [
  { igdbId: 1, name: 'Hades', closestLibraryGames: ['Dead Cells'], sharedTags: ['Roguelike'] },
  { igdbId: 2, name: 'Celeste', closestLibraryGames: [], sharedTags: [] },
];

function reply(content: unknown, status = 200) {
  return vi.fn(
    async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status }),
  );
}
const body = (reasons: unknown) => JSON.stringify({ reasons });
const make = (fetch: ReturnType<typeof reply>, extra = {}) =>
  createDeepseekExplainer({
    apiKey: 'sk-test',
    fetch: fetch as unknown as typeof globalThis.fetch,
    ...extra,
  });

describe('createDeepseekExplainer', () => {
  it('sends one JSON-mode call and returns reasons by id', async () => {
    const fetch = reply(
      body([
        { id: 1, text: 'You liked Dead Cells, so this roguelike should hit the spot.' },
        { id: 2, text: 'A tight platformer about climbing a mountain.' },
      ]),
    );
    const out = await make(fetch).explain(items);
    expect(out.get(1)).toMatch(/Dead Cells/);
    expect(out.size).toBe(2);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0]!;
    expect(String(url)).toBe('https://api.deepseek.com/chat/completions');
    const headers = init!.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer sk-test');
    const sent = JSON.parse(String(init!.body));
    expect(sent.model).toBe('deepseek-flash');
    expect(sent.temperature).toBe(0.4);
    expect(sent.response_format).toEqual({ type: 'json_object' });
    expect(sent.messages[0].role).toBe('system');
    const user = sent.messages[1].content as string;
    expect(user).toContain('Hades');
    expect(user).toContain('Dead Cells');
    expect(user).not.toMatch(/user|email/i);
  });

  it('honours model and base url overrides', async () => {
    const fetch = reply(body([]));
    await make(fetch, { model: 'm', baseUrl: 'https://x.test/' }).explain(items);
    expect(String(fetch.mock.calls[0]![0])).toBe('https://x.test/chat/completions');
    expect(JSON.parse(String(fetch.mock.calls[0]![1]!.body)).model).toBe('m');
  });

  it('drops missing, empty, over-long and unknown-id reasons; trims 141-160 chars at a word', async () => {
    const long = `${'word '.repeat(30)}end`.slice(0, 155); // 155 chars
    const tooLong = 'x'.repeat(161);
    const fetch = reply(
      body([
        { id: 1, text: long },
        { id: 2, text: '   ' },
        { id: 99, text: 'not asked for' },
        { id: 'x', text: 'bad id' },
      ]),
    );
    const out = await make(fetch).explain(items);
    expect([...out.keys()]).toEqual([1]);
    expect(out.get(1)!.length).toBeLessThanOrEqual(REASON_MAX_CHARS);
    expect(out.get(1)!.endsWith('wor')).toBe(false);
    const out2 = await make(reply(body([{ id: 1, text: tooLong }]))).explain(items);
    expect(out2.size).toBe(0);
  });

  it('returns nothing for an empty batch without calling', async () => {
    const fetch = reply(body([]));
    expect((await make(fetch).explain([])).size).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('throws on HTTP errors, empty content and malformed JSON', async () => {
    await expect(make(reply('', 500)).explain(items)).rejects.toThrow(/HTTP 500/);
    await expect(make(reply('  ')).explain(items)).rejects.toThrow(/empty/);
    await expect(make(reply('not json')).explain(items)).rejects.toThrow();
    await expect(make(reply('{"nope":1}')).explain(items)).rejects.toThrow();
  });

  it('aborts after the timeout', async () => {
    const fetch = vi.fn(
      (_u: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_res, rej) =>
          init!.signal!.addEventListener('abort', () => rej(new Error('aborted'))),
        ),
    );
    await expect(
      make(fetch as unknown as ReturnType<typeof reply>, { timeoutMs: 20 }).explain(items),
    ).rejects.toThrow();
  });
});
