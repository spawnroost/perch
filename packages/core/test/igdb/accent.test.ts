import { describe, expect, it } from 'vitest';
import jpeg from 'jpeg-js';
import { createAccentFetcher, createAccentQueue, pickAccent } from '../../src/igdb/accent.js';

/** Builds an RGBA buffer from [r,g,b,count] runs. */
function pixels(runs: Array<[number, number, number, number]>, alpha = 255): Uint8Array {
  const total = runs.reduce((n, r) => n + r[3], 0);
  const out = new Uint8Array(total * 4);
  let i = 0;
  for (const [r, g, b, count] of runs) {
    for (let k = 0; k < count; k++) out.set([r, g, b, alpha], 4 * i++);
  }
  return out;
}

const hexToRgb = (h: string): [number, number, number] => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

describe('pickAccent', () => {
  it('returns a lowercase #rrggbb hex', () => {
    expect(pickAccent(pixels([[200, 40, 40, 100]]))).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('prefers the saturated colour over a bigger grey/black area', () => {
    const hex = pickAccent(
      pixels([
        [20, 20, 20, 800],
        [128, 128, 128, 300],
        [220, 30, 40, 100],
      ]),
    )!;
    const [r, g, b] = hexToRgb(hex);
    expect(r).toBeGreaterThan(g + 60);
    expect(r).toBeGreaterThan(b + 60);
  });

  it('picks the dominant of two vivid hues', () => {
    const hex = pickAccent(
      pixels([
        [40, 60, 230, 400],
        [230, 60, 40, 100],
      ]),
    )!;
    const [r, , b] = hexToRgb(hex);
    expect(b).toBeGreaterThan(r);
  });

  it('keeps the accent usable on dark backgrounds (not too dark or too light)', () => {
    for (const run of [
      [5, 0, 30, 100],
      [255, 250, 255, 100],
      [250, 250, 200, 100],
    ] as const) {
      const hex = pickAccent(
        pixels([[...run] as [number, number, number, number], [200, 30, 30, 50]]),
      );
      if (hex === null) continue;
      const [r, g, b] = hexToRgb(hex);
      const l = (Math.max(r, g, b) + Math.min(r, g, b)) / 2 / 255;
      expect(l).toBeGreaterThanOrEqual(0.3);
      expect(l).toBeLessThanOrEqual(0.7);
    }
  });

  it('returns null for greyscale, transparent or empty images', () => {
    expect(pickAccent(pixels([[90, 90, 90, 100]]))).toBeNull();
    expect(pickAccent(pixels([[255, 0, 0, 100]], 0))).toBeNull();
    expect(pickAccent(new Uint8Array(0))).toBeNull();
  });
});

describe('createAccentFetcher', () => {
  const red = jpeg.encode(
    { data: Buffer.from(pixels([[220, 30, 40, 16 * 16]])), width: 16, height: 16 },
    90,
  ).data;
  const ok = (body: Uint8Array) => (async () => new Response(Buffer.from(body))) as typeof fetch;

  it('downloads, decodes and picks the colour', async () => {
    const hex = await createAccentFetcher({ fetch: ok(red) })('https://img.test/a.jpg');
    const [r, g] = hexToRgb(hex!);
    expect(r).toBeGreaterThan(g + 60);
  });

  it('is null (never throws) on HTTP errors, junk bytes and network failures', async () => {
    const bad = (async () => new Response('nope', { status: 404 })) as typeof fetch;
    const boom = (async () => {
      throw new Error('offline');
    }) as typeof fetch;
    expect(await createAccentFetcher({ fetch: bad })('u')).toBeNull();
    expect(await createAccentFetcher({ fetch: ok(new Uint8Array([1, 2, 3])) })('u')).toBeNull();
    expect(await createAccentFetcher({ fetch: boom })('u')).toBeNull();
  });
});

describe('createAccentQueue', () => {
  it('runs at most `concurrency` jobs at once', async () => {
    const q = createAccentQueue(2);
    let active = 0;
    let peak = 0;
    const job = async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return '#000000';
    };
    await Promise.all(['a', 'b', 'c', 'd', 'e'].map((u) => q.run(u, job)));
    expect(peak).toBe(2);
  });

  it('shares one in-flight job per URL, and runs it again once it has settled', async () => {
    const q = createAccentQueue(4);
    let calls = 0;
    const job = async () => {
      calls++;
      return '#111111';
    };
    const [x, y] = await Promise.all([q.run('u', job), q.run('u', job)]);
    expect([x, y, calls]).toEqual(['#111111', '#111111', 1]);
    await q.run('u', job);
    expect(calls).toBe(2);
  });

  it('keeps going after a failing job', async () => {
    const q = createAccentQueue(1);
    await expect(q.run('a', async () => Promise.reject(new Error('x')))).rejects.toThrow();
    expect(await q.run('b', async () => '#222222')).toBe('#222222');
  });
});
