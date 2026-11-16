import { describe, expect, it } from 'vitest';
import { previewImport } from '../../src/library/preview.js';

describe('previewImport concurrency', () => {
  it('runs searches concurrently (bounded) and keeps line order', async () => {
    let inFlight = 0;
    let peak = 0;
    const client = {
      async searchGames(name: string) {
        inFlight++;
        peak = Math.max(peak, inFlight);
        // Earlier lines finish later, so order must come from the input not completion.
        await new Promise((r) => setTimeout(r, name === 'Game 1' ? 30 : 5));
        inFlight--;
        return { candidates: [] };
      },
    };
    const text = Array.from({ length: 12 }, (_, i) => `Game ${i + 1}`).join('\n');
    const { lines } = await previewImport(client as never, text, 100);
    expect(lines.map((l) => l.entry.name)).toEqual(
      Array.from({ length: 12 }, (_, i) => `Game ${i + 1}`),
    );
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(4);
  });
});
