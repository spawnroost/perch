import { describe, expect, it } from 'vitest';
import {
  matchCpu,
  matchGpu,
  normaliseCpu,
  normaliseGpu,
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
