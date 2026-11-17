import jpeg from 'jpeg-js';

const HUE_BUCKETS = 12;
const MIN_SATURATION = 0.25;
/** Pixels darker/lighter than this carry no usable hue. */
const MIN_LIGHTNESS = 0.12;
const MAX_LIGHTNESS = 0.9;
/** The returned accent is clamped to this lightness range so it reads on a dark UI. */
const OUT_MIN_L = 0.4;
const OUT_MAX_L = 0.62;

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const rr = r / 255;
  const gg = g / 255;
  let h: number;
  if (max === rr) h = ((gg - b / 255) / d + 6) % 6;
  else if (max === gg) h = (b / 255 - rr) / d + 2;
  else h = (rr - gg) / d + 4;
  return [h * 60, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return (
    '#' +
    [r, g, b]
      .map((v) =>
        Math.round((v + m) * 255)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}

/**
 * The most vivid dominant colour of an RGBA pixel buffer, as `#rrggbb`, or null when the image
 * has no colourful pixels (greyscale, transparent, empty). Pixels vote for a hue bucket with a
 * weight of saturation x mid-tone-ness, so big dark or grey areas lose to a saturated one.
 */
export function pickAccent(rgba: ArrayLike<number>): string | null {
  const buckets = Array.from({ length: HUE_BUCKETS }, () => ({
    w: 0,
    sinH: 0,
    cosH: 0,
    s: 0,
    l: 0,
  }));
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3]! < 128) continue;
    const [h, s, l] = rgbToHsl(rgba[i]!, rgba[i + 1]!, rgba[i + 2]!);
    if (s < MIN_SATURATION || l < MIN_LIGHTNESS || l > MAX_LIGHTNESS) continue;
    const w = s * (1 - Math.abs(2 * l - 1));
    const b = buckets[Math.min(HUE_BUCKETS - 1, Math.floor(h / (360 / HUE_BUCKETS)))]!;
    const rad = (h * Math.PI) / 180;
    b.w += w;
    b.sinH += Math.sin(rad) * w;
    b.cosH += Math.cos(rad) * w;
    b.s += s * w;
    b.l += l * w;
  }
  const best = buckets.reduce((a, b) => (b.w > a.w ? b : a));
  if (best.w === 0) return null;
  const hue = ((Math.atan2(best.sinH, best.cosH) * 180) / Math.PI + 360) % 360;
  const sat = Math.min(1, Math.max(0.5, best.s / best.w));
  const light = Math.min(OUT_MAX_L, Math.max(OUT_MIN_L, best.l / best.w));
  return hslToHex(hue, sat, light);
}

export interface AccentFetcherOptions {
  /** Injected in tests; defaults to the global fetch. */
  fetch?: typeof fetch;
}

/** Downloads a JPEG and picks its accent. Resolves null on any failure (never throws). */
export function createAccentFetcher(
  opts: AccentFetcherOptions = {},
): (url: string) => Promise<string | null> {
  const doFetch: typeof fetch = opts.fetch ?? ((...args) => fetch(...args));
  return async (url) => {
    try {
      const res = await doFetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) return null;
      const { data } = jpeg.decode(new Uint8Array(await res.arrayBuffer()), {
        useTArray: true,
        maxResolutionInMP: 4,
      });
      return pickAccent(data);
    } catch {
      return null;
    }
  };
}
