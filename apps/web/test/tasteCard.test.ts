import { describe, expect, it, vi } from 'vitest';
import {
  cardFilename,
  collageLayout,
  exportCardPng,
  formatHours,
  platformLabel,
  reveal,
  revealSettleMs,
  shareLabel,
  statusTiles,
} from '../src/lib/tasteCard.js';

describe('reveal', () => {
  it('staggers each item a little later, rising into place', () => {
    const a = reveal(0, false);
    const b = reveal(3, false);
    expect(a.initial).toMatchObject({ opacity: 0 });
    expect(a.animate).toMatchObject({ opacity: 1, y: 0 });
    const delay = (t: object) => (t as { delay: number }).delay;
    expect(delay(b.transition)).toBeGreaterThan(delay(a.transition));
  });

  it('does not move at all when motion is reduced', () => {
    const r = reveal(5, true);
    expect(r.initial).toBe(false);
    expect(r.transition).toEqual({ duration: 0 });
  });

  it('settles after the last item; instantly when reduced', () => {
    expect(revealSettleMs(10, false)).toBeGreaterThan(revealSettleMs(2, false));
    expect(revealSettleMs(10, true)).toBe(0);
  });
});

describe('formatting', () => {
  it('shows small hours with a decimal and big ones grouped', () => {
    expect(formatHours(0)).toBe('0');
    expect(formatHours(7.25)).toBe('7.3');
    expect(formatHours(12.4)).toBe('12');
    expect(formatHours(1234.6)).toBe('1,235');
  });

  it('names platforms, uppercasing unknown ones', () => {
    expect(platformLabel('pc')).toBe('PC');
    expect(platformLabel('ps5')).toBe('PS5');
    expect(platformLabel('switch')).toBe('Switch');
    expect(platformLabel('gamecube')).toBe('GAMECUBE');
  });

  it('writes a share as a whole percent', () => {
    expect(shareLabel(2 / 3)).toBe('67%');
    expect(shareLabel(1)).toBe('100%');
  });

  it('slugs the playstyle into a file name', () => {
    expect(cardFilename('Metroidvania explorer')).toBe('perch-metroidvania-explorer.png');
    expect(cardFilename(null)).toBe('perch-taste-card.png');
    expect(cardFilename('Co-op / fan!')).toBe('perch-co-op-fan.png');
  });
});

describe('statusTiles', () => {
  it('lists the statuses in play order, leaving out empty ones', () => {
    expect(
      statusTiles({ playing: 2, finished: 5, dropped: 0, backlog: 9, paused: 1 }).map((t) => [
        t.status,
        t.count,
      ]),
    ).toEqual([
      ['playing', 2],
      ['finished', 5],
      ['backlog', 9],
      ['paused', 1],
    ]);
  });
});

describe('collageLayout', () => {
  const covers = (n: number) => Array.from({ length: n }, (_, i) => ({ igdbId: i }));
  it('fills whole rows only', () => {
    expect(collageLayout(covers(9))).toMatchObject({ cols: 3 });
    expect(collageLayout(covers(9)).items).toHaveLength(9);
    expect(collageLayout(covers(8)).items).toHaveLength(6);
    expect(collageLayout(covers(4))).toMatchObject({ cols: 2 });
    expect(collageLayout(covers(4)).items).toHaveLength(4);
    expect(collageLayout(covers(1))).toMatchObject({ cols: 1 });
  });
  it('is empty with no covers', () => {
    expect(collageLayout([]).items).toEqual([]);
  });
});

describe('exportCardPng', () => {
  const node = {} as HTMLElement;
  it('renders with the covers when it can', async () => {
    const render = vi.fn().mockResolvedValue('data:image/png;base64,AAA');
    expect(await exportCardPng(node, render)).toEqual({
      dataUrl: 'data:image/png;base64,AAA',
      withCovers: true,
    });
    expect(render).toHaveBeenCalledTimes(1);
    const filter = render.mock.calls[0]?.[1].filter as (n: unknown) => boolean;
    expect(filter({ tagName: 'IMG' })).toBe(true);
    expect(filter({ tagName: 'DIV', dataset: { exportSkip: '' } })).toBe(false);
    expect(filter({ nodeType: 3 })).toBe(true);
  });

  it('falls back to the card without cover images when the first render fails', async () => {
    const render = vi
      .fn()
      .mockRejectedValueOnce(new Error('tainted'))
      .mockResolvedValueOnce('data:image/png;base64,BBB');
    const out = await exportCardPng(node, render);
    expect(out).toEqual({ dataUrl: 'data:image/png;base64,BBB', withCovers: false });
    const filter = render.mock.calls[1]?.[1].filter as (n: unknown) => boolean;
    expect(filter({ tagName: 'IMG' })).toBe(false);
    expect(filter({ tagName: 'DIV' })).toBe(true);
    expect(filter({ tagName: 'DIV', dataset: { exportSkip: '' } })).toBe(false);
  });

  it('gives up when even the plain card fails', async () => {
    const render = vi.fn().mockRejectedValue(new Error('nope'));
    await expect(exportCardPng(node, render)).rejects.toThrow('nope');
  });
});
