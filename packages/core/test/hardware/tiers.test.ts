import { describe, expect, it } from 'vitest';
import {
  matchCpu,
  matchGpu,
  normaliseCpu,
  normaliseGpu,
  searchCpus,
  searchGpus,
} from '../../src/hardware/index.js';

const gpuKey = (raw: string) => matchGpu(raw)?.key ?? null;
const cpuKey = (raw: string) => matchCpu(raw)?.key ?? null;
const gpuScore = (raw: string) => {
  const m = matchGpu(raw);
  if (!m) throw new Error(`no GPU match for ${raw}`);
  return m.score;
};
const cpuScore = (raw: string) => {
  const m = matchCpu(raw);
  if (!m) throw new Error(`no CPU match for ${raw}`);
  return m.score;
};

describe('normaliseGpu', () => {
  it('strips vendor words, VRAM and trademarks', () => {
    expect(normaliseGpu('NVIDIA GeForce GTX 1060 6GB')).toBe('gtx 1060');
    expect(normaliseGpu('AMD Radeon(TM) RX 580 8 GB')).toBe('rx 580');
    expect(normaliseGpu('Intel(R) HD Graphics 4000')).toBe('hd 4000');
  });

  it('normalises mobile and max-q to laptop', () => {
    expect(normaliseGpu('GeForce GTX 1660 Ti Mobile')).toBe('gtx 1660 ti laptop');
    expect(normaliseGpu('NVIDIA GeForce RTX 3060 Laptop GPU')).toBe('rtx 3060 laptop');
    expect(normaliseGpu('GeForce GTX 1650 with Max-Q Design')).toBe('gtx 1650 laptop');
  });
});

describe('normaliseCpu', () => {
  it('strips brand, clock and core-count words', () => {
    expect(normaliseCpu('Intel(R) Core(TM) i7-9750H CPU @ 2.60GHz')).toBe('i7-9750h');
    expect(normaliseCpu('AMD Ryzen 7 5800X 8-Core Processor')).toBe('ryzen 7 5800x');
    expect(normaliseCpu('Intel Core i5 4460')).toBe('i5-4460');
  });
});

describe('matchGpu', () => {
  const cases: [string, string][] = [
    ['NVIDIA GeForce GTX 1060 6GB', 'gtx 1060'],
    ['GeForce GTX 1060 3GB', 'gtx 1060'],
    ['GTX 1060', 'gtx 1060'],
    ['AMD Radeon RX 580 8GB', 'rx 580'],
    ['Radeon RX 6700 XT', 'rx 6700 xt'],
    ['NVIDIA GeForce RTX 2060 SUPER', 'rtx 2060 super'],
    ['GeForce GTX 1050 Ti 4GB', 'gtx 1050 ti'],
    ['NVIDIA GeForce GTX 750 Ti', 'gtx 750 ti'],
    ['GeForce GTX 1660 Ti Mobile', 'gtx 1660 ti laptop'],
    ['NVIDIA GeForce RTX 3060 Laptop GPU', 'rtx 3060 laptop'],
    ['NVIDIA GeForce RTX 4070 Ti SUPER', 'rtx 4070 ti super'],
    ['Intel HD Graphics 4000', 'hd 4000'],
    ['Intel(R) UHD Graphics 630', 'uhd 630'],
    ['Intel(R) Iris(R) Xe Graphics', 'iris xe'],
    ['Intel Arc A770 Graphics', 'arc a770'],
    ['AMD Radeon Vega 8 Graphics', 'vega 8'],
    ['AMD Radeon 780M Graphics', '780m'],
    ['Apple M1 Pro', 'm1 pro'],
    ['AMD Radeon HD 7970', 'hd 7970'],
    ['AMD Radeon R9 290X', 'r9 290x'],
    ['AMD Custom GPU 0405', 'custom gpu 0405'],
    // WebGL renderer strings
    ['ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0)', 'rtx 3070'],
    [
      'ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 with Max-Q Design Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'gtx 1650 laptop',
    ],
    ['ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)', 'uhd 620'],
    ['ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Max, Unspecified Version)', 'm2 max'],
    ['NVIDIA GeForce GTX 1060 6GB/PCIe/SSE2', 'gtx 1060'],
    ['Mesa Intel(R) UHD Graphics 620 (KBL GT2)', 'uhd 620'],
  ];
  it.each(cases)('%s -> %s', (raw, key) => {
    expect(gpuKey(raw)).toBe(key);
  });

  it('returns the first match for alternatives', () => {
    expect(gpuKey('GeForce GTX 970 / Radeon R9 290')).toBe('gtx 970');
    expect(gpuKey('NVIDIA GTX 660 or AMD HD 7870 equivalent')).toBe('gtx 660');
    expect(gpuKey('DirectX 11 compatible / AMD Radeon RX 580')).toBe('rx 580');
  });

  it('does not confuse neighbouring models', () => {
    expect(gpuKey('GTX 1060')).toBe('gtx 1060');
    expect(gpuKey('GeForce GTX 1060 Ti')).toBeNull();
    expect(gpuKey('GTX 106')).toBeNull();
    expect(gpuKey('GTX 10600')).toBeNull();
    expect(gpuKey('GeForce GTX 780M')).not.toBe('780m');
  });

  it('ignores memory sizes, bit widths and core counts after the model', () => {
    expect(gpuKey('GTX 1050 Ti 4096 MB')).toBe('gtx 1050 ti');
    expect(gpuKey('RTX 3060 12G')).toBe('rtx 3060');
    expect(gpuKey('GeForce GTX 1060 3/6GB')).toBe('gtx 1060');
  });

  it('splits glued variant suffixes', () => {
    expect(gpuKey('GeForce GTX 1050Ti')).toBe('gtx 1050 ti');
    expect(gpuKey('Radeon RX 6600XT')).toBe('rx 6600 xt');
    expect(gpuKey('RTX 2080Super')).toBe('rtx 2080 super');
  });

  it('falls back to the base key when a laptop variant is not tabled', () => {
    expect(gpuKey('Intel HD Graphics 4000 Mobile')).toBe('hd 4000');
    expect(gpuKey('AMD Radeon Vega 8 Mobile Graphics')).toBe('vega 8');
    expect(gpuKey('GeForce GTX 1660 Ti Mobile')).toBe('gtx 1660 ti laptop');
  });

  it('discounts discrete laptop fallbacks by 20% but not integrated ones', () => {
    expect(gpuScore('GeForce RTX 3090 Ti Mobile')).toBe(Math.round(gpuScore('rtx 3090 ti') * 0.8));
    expect(gpuScore('Radeon RX 6600 Mobile')).toBe(Math.round(gpuScore('rx 6600') * 0.8));
    expect(gpuScore('Intel HD Graphics 4000 Mobile')).toBe(gpuScore('hd 4000'));
    expect(gpuScore('AMD Radeon Vega 8 Mobile Graphics')).toBe(gpuScore('vega 8'));
    // tabled laptop keys are not discounted again
    expect(gpuScore('GeForce RTX 3060 Laptop GPU')).toBe(13400);
  });

  it('keeps alternatives that follow a w/ clause', () => {
    expect(gpuKey('Intel HD 4000 w/ 1GB or AMD Radeon RX 580')).toBe('hd 4000');
    expect(gpuKey('Intel Graphics w/ shared memory or AMD Radeon RX 580')).toBe('rx 580');
  });

  it('returns null for junk and generic strings', () => {
    expect(matchGpu('')).toBeNull();
    expect(matchGpu('Unknown')).toBeNull();
    expect(matchGpu('Dedicated graphics card with 4GB VRAM')).toBeNull();
    expect(matchGpu('Microsoft Basic Render Driver')).toBeNull();
    expect(matchGpu('AMD Radeon(TM) Graphics')).toBeNull();
    expect(matchGpu('GeForce GTX 9999')).toBeNull();
  });

  it('orders GPUs sensibly', () => {
    const s = (k: string) => gpuScore(k);
    expect(s('rtx 4090')).toBeGreaterThan(s('rtx 3060'));
    expect(s('rtx 3060')).toBeGreaterThan(s('gtx 1060'));
    expect(s('gtx 1060')).toBeGreaterThan(s('gtx 750 ti'));
    expect(s('rtx 3060')).toBeGreaterThan(s('rtx 3060 laptop'));
    expect(s('steam deck gpu')).toBeGreaterThan(s('gtx 1050'));
    expect(s('steam deck gpu')).toBeLessThan(s('gtx 1650'));
    expect(s('rx 6700 xt')).toBeGreaterThan(s('rx 580'));
    expect(s('uhd 630')).toBeLessThan(s('gtx 750 ti'));
  });
});

describe('matchCpu', () => {
  const cases: [string, string][] = [
    ['Intel(R) Core(TM) i7-9750H CPU @ 2.60GHz', 'i7-9750h'],
    ['AMD Ryzen 5 3600', 'ryzen 5 3600'],
    ['AMD Ryzen 5 3600 6-Core Processor', 'ryzen 5 3600'],
    ['Intel Core i5-4460', 'i5-4460'],
    ['Intel Core i5-4460 3.2GHz', 'i5-4460'],
    ['Core i7 4770K', 'i7-4770k'],
    ['Intel Core i5-9400F', 'i5-9400f'],
    ['Intel Core i7-9700KF', 'i7-9700k'],
    ['AMD FX-8350', 'fx-8350'],
    ['AMD FX 8350 Eight-Core Processor', 'fx-8350'],
    ['AMD Phenom II X4 965', 'phenom ii x4 965'],
    ['Intel Core 2 Duo E8400', 'core2 duo e8400'],
    ['Intel Core Ultra 7 155H', 'ultra 7 155h'],
    ['AMD Ryzen 7 5800X3D', 'ryzen 7 5800x3d'],
    ['AMD Ryzen 9 7940HS w/ Radeon 780M Graphics', 'ryzen 9 7940hs'],
    ['AMD Ryzen Z1 Extreme', 'ryzen z1 extreme'],
    ['Apple M1 Pro', 'm1 pro'],
    ['AMD Custom APU 0405', 'custom apu 0405'],
  ];
  it.each(cases)('%s -> %s', (raw, key) => {
    expect(cpuKey(raw)).toBe(key);
  });

  it('does not confuse neighbouring models', () => {
    expect(cpuKey('AMD Ryzen 5 3600X')).toBe('ryzen 5 3600x');
    expect(cpuKey('AMD Ryzen 5 36000')).toBeNull();
    expect(cpuKey('Intel Core i7-9750HK')).toBeNull();
  });

  it('ignores core/thread/bit notes', () => {
    expect(cpuKey('AMD Ryzen 5 3600 6 cores')).toBe('ryzen 5 3600');
    expect(cpuKey('Intel Core i5-8400 64-bit')).toBe('i5-8400');
    expect(cpuKey('Ryzen 5 1600 6 Cores 12 Threads')).toBe('ryzen 5 1600');
    expect(cpuKey('Intel Core i7-4770K (4 cores/8 threads)')).toBe('i7-4770k');
    expect(cpuKey('Intel Core i7-4770K 4 cores/8 threads')).toBe('i7-4770k');
  });

  it('keeps alternatives that follow a w/ clause', () => {
    expect(cpuKey('Intel Core i5 w/ 4 cores or AMD Ryzen 5 1600')).toBe('ryzen 5 1600');
    expect(cpuKey('AMD Ryzen 5 5600G with Radeon Graphics')).toBe('ryzen 5 5600g');
  });

  it('returns null for junk and generic strings', () => {
    expect(matchCpu('')).toBeNull();
    expect(matchCpu('Quad core 2.4GHz or better')).toBeNull();
    expect(matchCpu('Intel Core i7')).toBeNull();
    expect(matchCpu('AMD Ryzen')).toBeNull();
    expect(matchCpu('asdf qwerty')).toBeNull();
  });

  it('orders CPUs sensibly', () => {
    expect(cpuScore('Ryzen 9 7950X')).toBeGreaterThan(cpuScore('Ryzen 5 3600'));
    expect(cpuScore('Ryzen 5 3600')).toBeGreaterThan(cpuScore('Intel Core i5-4460'));
    expect(cpuScore('Intel Core i5-4460')).toBeGreaterThan(cpuScore('Core 2 Duo E8400'));
    expect(cpuScore('steam deck cpu')).toBeGreaterThan(cpuScore('Intel Core i5-4460') * 0.9);
    expect(cpuScore('ryzen z1 extreme')).toBeGreaterThan(cpuScore('steam deck cpu'));
  });
});

describe('tier tables', () => {
  it('contain the required custom keys', () => {
    expect(matchGpu('steam deck gpu')?.key).toBe('steam deck gpu');
    expect(matchCpu('steam deck cpu')?.key).toBe('steam deck cpu');
  });
});

describe('Steam requirement strings', () => {
  it('matches old NVIDIA cards written number-first', () => {
    expect(gpuKey('NVIDIA 9800 GT 1GB / AMD HD 4870 1GB (DX 10, 10.1, 11)')).toBe('9800 gt');
    expect(gpuKey('AMD HD 4870 1GB')).toBe('hd 4870');
    expect(gpuKey('NVIDIA GeForce 8600/9600GT, ATI/AMD Radeon HD2600/3600')).toBe('8600 gt');
    expect(gpuKey('9600GT')).toBe('9600 gt');
    expect(gpuKey('ATI Radeon HD2600')).toBe('hd 2600');
  });

  it('adds the series prefix to a bare NVIDIA model number', () => {
    expect(gpuKey('2060 Super')).toBe('rtx 2060 super');
    expect(gpuKey('Nvidia 2060 Super / RX 5700 XT')).toBe('rtx 2060 super');
    expect(gpuKey('NVIDIA Geforce 1060 or equivalent')).toBe('gtx 1060');
    expect(gpuKey('1 GB & AMD 5570 or nVidia 450')).toBe('gtx 450');
    expect(gpuKey('2GB & AMD 7970 or nVidia 770 or greater')).toBe('gtx 770');
  });

  it('does not guess a prefix for bare AMD / ambiguous numbers', () => {
    expect(gpuKey('AMD 5570')).toBeNull();
    expect(gpuKey('AMD 7970')).toBeNull();
    expect(gpuKey('580')).toBeNull();
    expect(gpuKey('9999')).toBeNull();
  });

  it('strips "(4 CPUs)" and the word CPU', () => {
    expect(cpuKey('Intel Core 2 Quad CPU Q6600 @ 2.40GHz (4 CPUs) / AMD Phenom 9850')).toBe(
      'core2 quad q6600',
    );
    expect(cpuKey('Intel Core i5 3470 @ 3.2GHz (4 CPUs) / AMD X8 FX-8350 @ 4GHz (8 CPUs)')).toBe(
      'i5-3470',
    );
  });

  it('knows CPUs that Steam lists', () => {
    expect(cpuKey('Intel Core i5-6600 or equivalent')).toBe('i5-6600');
    expect(cpuKey('Intel Core i5-2300 2.8 GHz/AMD Phenom II X4 945 3.0 GHz or equivalent')).toBe(
      'i5-2300',
    );
    expect(cpuKey('AMD Phenom II X4 945 3.0 GHz')).toBe('phenom ii x4 945');
    expect(cpuKey('Intel Core i3 M380')).toBe('i3-m380');
    expect(cpuKey('INTEL i3-4330')).toBe('i3-4330');
  });

  it('orders the new keys sensibly', () => {
    expect(gpuScore('GTX 450')).toBeGreaterThan(gpuScore('9800 GT'));
    expect(gpuScore('HD 4870')).toBeGreaterThan(gpuScore('9600 GT'));
    expect(gpuScore('9600 GT')).toBeGreaterThan(gpuScore('8600 GT'));
    expect(cpuScore('i5-6600')).toBeGreaterThan(cpuScore('i5-6500'));
    expect(cpuScore('i5-6600k')).toBeGreaterThan(cpuScore('i5-6600'));
    expect(cpuScore('i5-2400')).toBeGreaterThan(cpuScore('i5-2300'));
    expect(cpuScore('i3-2100')).toBeGreaterThan(cpuScore('i3-m380'));
    expect(cpuScore('i3-4330')).toBeGreaterThan(cpuScore('i3-4160'));
    expect(cpuScore('phenom ii x4 955')).toBeGreaterThan(cpuScore('phenom ii x4 945'));
  });

  it('keeps model numbers that are followed by the word CPU', () => {
    expect(cpuKey('Intel Core i5-2500 CPU @ 3.30GHz')).toBe('i5-2500');
    expect(cpuKey('Intel(R) Core(TM) i7-6700 CPU @ 3.40GHz')).toBe('i7-6700');
    expect(cpuKey('AMD FX 8350 CPU')).toBe('fx-8350');
    expect(cpuKey('AMD FX-8350 CPU')).toBe('fx-8350');
    expect(cpuKey('Intel Core 2 Quad Q6600 (4 CPUs)')).toBe('core2 quad q6600');
    expect(cpuKey('Intel Core 2 Quad Q6600 4 CPUs')).toBe('core2 quad q6600');
  });

  it('handles a spaced M in mobile Core names', () => {
    expect(normaliseCpu('Intel Core i7 M 620')).toBe('i7-m620');
    expect(cpuKey('Intel Core i7 M 620')).toBe('i7-m620');
    expect(cpuKey('Intel Core i3 M 380')).toBe('i3-m380');
  });

  it('carries NVIDIA brand context to every alternative', () => {
    expect(gpuKey('NVIDIA 9999 / 770')).toBe('gtx 770');
    expect(gpuKey('NVIDIA 9999 or 450')).toBe('gtx 450');
    expect(gpuKey('AMD HD 9999 / 770')).toBeNull();
    expect(gpuKey('NVIDIA 9999 / AMD 5570 / 770')).toBeNull();
  });
});

describe('autocomplete', () => {
  it.each(['NVIDIA RTX 4070', 'rtx4070', 'rtx 4070', '4070'])('finds RTX 4070 for %s', (q) => {
    expect(searchGpus(q).map((m) => m.key)).toContain('rtx 4070');
  });
  it('finds 4070 ti by "rtx4070ti"', () => {
    expect(searchGpus('rtx4070ti').map((m) => m.key)).toContain('rtx 4070 ti');
  });
  it.each(['i7-12700k', '12700', 'i7 12700', 'Intel Core i7-12700K'])(
    'finds the 12700K for %s',
    (q) => {
      expect(searchCpus(q).map((m) => m.key)).toContain('i7-12700k');
    },
  );
  it('finds i5 parts for "Intel Core i5"', () => {
    const keys = searchCpus('Intel Core i5').map((m) => m.key);
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.every((k) => k.startsWith('i5'))).toBe(true);
  });
  it('returns nothing for an empty query', () => {
    expect(searchGpus('')).toEqual([]);
  });
});
