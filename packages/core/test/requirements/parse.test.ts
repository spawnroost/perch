import { describe, expect, it } from 'vitest';
import {
  noneLlm,
  parseRamGb,
  parseRequirementsHtml,
  parseSteamRequirements,
  scoreRequirements,
} from '../../src/requirements/index.js';
import { steamFixture, steamFixtures } from './helpers.js';

describe('parseRamGb', () => {
  it.each([
    ['8 GB RAM', 8],
    ['8GB', 8],
    ['8 gb', 8],
    ['8192 MB', 8],
    ['512 MB RAM', 0.5],
    ['2.5GB', 2.5],
    ['4 GB RAM or more', 4],
    ['16 Gigabytes', 16],
    ['1,024 MB', 1],
  ])('%s -> %s GB', (text, gb) => {
    expect(parseRamGb(text)).toBe(gb);
  });

  it.each(['', 'lots', 'DirectX 11', '4'])('%j -> undefined', (text) => {
    expect(parseRamGb(text)).toBeUndefined();
  });
});

describe('parseRequirementsHtml', () => {
  it('reads the Steam bb_ul list format', () => {
    const html =
      '<strong>Minimum:</strong><br><ul class="bb_ul"><li><strong>OS:</strong> Windows 10<br></li>' +
      '<li><strong>Processor:</strong> Core i7-6700 or Ryzen 5 1600<br></li>' +
      '<li><strong>Memory:</strong> 12 GB RAM<br></li>' +
      '<li><strong>Graphics:</strong> GeForce GTX 1060 6GB or Radeon RX 580 8GB<br></li></ul>';
    expect(parseRequirementsHtml(html)).toEqual({
      cpuRaw: 'Core i7-6700 or Ryzen 5 1600',
      ramGb: 12,
      gpuRaw: 'GeForce GTX 1060 6GB or Radeon RX 580 8GB',
    });
  });

  it('accepts Video Card / CPU / RAM labels and decodes entities', () => {
    const html =
      '<ul><li>CPU: Intel&reg; Core&trade; i5-2500K</li><li>RAM: 8192 MB</li>' +
      '<li>Video Card: AMD &amp; NVIDIA GTX 770</li></ul>';
    expect(parseRequirementsHtml(html)).toEqual({
      cpuRaw: 'Intel Core i5-2500K',
      ramGb: 8,
      gpuRaw: 'AMD & NVIDIA GTX 770',
    });
  });

  it('returns an empty object for empty or unlabelled input', () => {
    expect(parseRequirementsHtml('')).toEqual({});
    expect(parseRequirementsHtml('<p>Any modern PC</p>')).toEqual({});
  });

  it('falls back to RAM in comma-separated prose', () => {
    const html = '<p><strong>Minimum: </strong>1.7 GHz Processor, 512MB RAM, DirectX 8.1 Card</p>';
    expect(parseRequirementsHtml(html)).toEqual({ ramGb: 0.5 });
  });
});

describe('parseSteamRequirements', () => {
  it('treats [] / undefined as no requirements', () => {
    for (const input of [[], undefined, null, {}]) {
      expect(parseSteamRequirements(input)).toEqual({ min: {}, rec: null });
    }
  });

  it('keeps rec null when there is no recommended section', () => {
    const { min, rec } = parseSteamRequirements({
      minimum: '<ul><li><strong>Memory:</strong> 4 GB RAM</li></ul>',
    });
    expect(min.ramGb).toBe(4);
    expect(rec).toBeNull();
  });

  it('splits an inline "Recommended:" paragraph out of the minimum text', () => {
    const { min, rec } = parseSteamRequirements(steamFixture(400).pcRequirements);
    expect(min).toEqual({ ramGb: 0.5 });
    expect(rec).toEqual({ ramGb: 1 });
  });
});

describe('scoreRequirements', () => {
  it('scores matched hardware and leaves the rest null', () => {
    const s = scoreRequirements({
      min: { gpuRaw: 'GeForce GTX 1060 6GB', cpuRaw: 'Dual Core 2.4 GHz', ramGb: 8 },
      rec: null,
    });
    expect(s.minGpuScore).toBeGreaterThan(0);
    expect(s.minGpuKey).toBeTruthy();
    expect(s.minCpuScore).toBeNull();
    expect(s.minCpuKey).toBeNull();
    expect(s.minRamGb).toBe(8);
    expect(s.recGpuScore).toBeNull();
    expect(s.recCpuScore).toBeNull();
    expect(s.recRamGb).toBeNull();
  });
});

describe('per-field scoring', () => {
  it('a recommended block with only some fields keeps the rest null', () => {
    const s = scoreRequirements({
      min: { gpuRaw: 'GTX 1060', cpuRaw: 'i5-8400', ramGb: 8 },
      rec: { ramGb: 16 },
    });
    expect([s.recGpuScore, s.recCpuScore]).toEqual([null, null]);
    expect(s.recRamGb).toBe(16);
    expect(s.minGpuScore).toBeGreaterThan(0);
  });

  it('keeps a recommended block that only has a CPU', () => {
    const { rec } = parseSteamRequirements({
      minimum: '<ul><li><strong>Memory:</strong> 4 GB RAM</li></ul>',
      recommended: '<ul><li><strong>Processor:</strong> Core i7-6700</li></ul>',
    });
    expect(rec).toEqual({ cpuRaw: 'Core i7-6700' });
  });
});

describe('LLM fallback', () => {
  it('the none provider leaves everything unknown', async () => {
    await expect(noneLlm.parse('Needs a decent PC')).resolves.toBeNull();
  });
});

interface Expect {
  min: { gpu: string | null; cpu: string | null; ram: number | null };
  rec?: { gpu: string | null; cpu: string | null; ram: number | null } | null;
}

/** Hand-checked against the fixture text (matched keys are tier-table keys). */
const EXPECTED: Record<number, Expect> = {
  1091500: {
    min: { gpu: 'gtx 1060', cpu: 'i7-6700', ram: 12 },
    rec: { gpu: 'rtx 2060 super', cpu: 'i7-12700', ram: 16 },
  },
  1245620: {
    min: { gpu: 'gtx 1060', cpu: 'i5-8400', ram: 12 },
    rec: { gpu: 'gtx 1070', cpu: 'i7-8700k', ram: 16 },
  },
  1174180: {
    min: { gpu: 'gtx 770', cpu: 'i5-2500k', ram: 8 },
    rec: { gpu: 'gtx 1060', cpu: 'i7-4770k', ram: 12 },
  },
  292030: {
    min: { gpu: 'gtx 1660', cpu: 'i5-8400', ram: 12 },
    rec: { gpu: 'rtx 2060 super', cpu: 'i7-8700k', ram: 16 },
  },
  367520: {
    min: { gpu: 'gtx 560 ti', cpu: 'i3-3240', ram: 4 },
    rec: { gpu: 'gtx 1050', cpu: 'i5-3470', ram: 8 },
  },
  1237970: {
    min: { gpu: 'gtx 660', cpu: 'i3-6300', ram: 8 },
    rec: { gpu: 'gtx 1060', cpu: 'i5-6600', ram: 16 },
  },
  1145360: { min: { gpu: null, cpu: null, ram: 4 }, rec: { gpu: null, cpu: null, ram: 8 } },
  504230: { min: { gpu: 'hd 4000', cpu: 'i3-m380', ram: 2 }, rec: null },
  413150: { min: { gpu: null, cpu: null, ram: 2 }, rec: null },
  220: { min: { gpu: null, cpu: null, ram: 0.5 }, rec: null },
  620: { min: { gpu: 'hd 2000', cpu: null, ram: 2 }, rec: null },
  105600: { min: { gpu: null, cpu: null, ram: 2.5 }, rec: { gpu: null, cpu: null, ram: 4 } },
  632470: { min: { gpu: null, cpu: null, ram: 2 }, rec: { gpu: 'gtx 1060', cpu: null, ram: 8 } },
  975370: { min: { gpu: 'hd 3000', cpu: null, ram: 4 }, rec: { gpu: null, cpu: null, ram: 4 } },
  427520: {
    min: { gpu: 'gtx 750 ti', cpu: null, ram: 8 },
    rec: { gpu: 'gtx 1050 ti', cpu: null, ram: 16 },
  },
  945360: {
    min: { gpu: 'hd 4600', cpu: 'i3-4330', ram: 1 },
    rec: { gpu: 'gtx 650', cpu: 'i3-4330', ram: 4 },
  },
  271590: {
    min: { gpu: '9800 gt', cpu: 'core2 quad q6600', ram: 4 },
    rec: { gpu: 'gtx 660', cpu: 'i5-3470', ram: 8 },
  },
  570: { min: { gpu: '8600 gt', cpu: null, ram: 4 }, rec: null },
  377160: {
    min: { gpu: 'gtx 550 ti', cpu: 'i5-2300', ram: 8 },
    rec: { gpu: 'gtx 780', cpu: 'i7-4790', ram: 8 },
  },
  289070: {
    min: { gpu: 'gtx 450', cpu: null, ram: 4 },
    rec: { gpu: 'gtx 770', cpu: 'fx-8350', ram: 8 },
  },
};

describe('Steam fixtures', () => {
  it('has a varied fixture set', () => {
    expect(steamFixtures.length).toBeGreaterThanOrEqual(20);
  });

  it.each(steamFixtures.map((f) => [f.appId, f.name, f] as const))(
    '%s %s parses without throwing',
    (_id, _name, f) => {
      const parsed = parseSteamRequirements(f.pcRequirements);
      const scored = scoreRequirements(parsed);
      expect(scored.minRamGb === null || scored.minRamGb > 0).toBe(true);
      if (parsed.rec === null) expect(scored.recGpuScore).toBeNull();
      const rec = (f.pcRequirements as { recommended?: string } | undefined)?.recommended;
      if (rec && /(processor|memory|graphics)\s*:/i.test(rec)) expect(parsed.rec).not.toBeNull();
    },
  );

  it.each(
    Object.entries(EXPECTED).map(
      ([id, e]) => [Number(id), steamFixture(Number(id)).name, e] as const,
    ),
  )('%s %s matches hand-checked values', (id, _name, want) => {
    const s = scoreRequirements(parseSteamRequirements(steamFixture(id).pcRequirements));
    expect({ gpu: s.minGpuKey, cpu: s.minCpuKey, ram: s.minRamGb }).toEqual(want.min);
    if (want.rec === undefined) return;
    if (want.rec === null) {
      expect([s.recGpuScore, s.recCpuScore, s.recRamGb]).toEqual([null, null, null]);
    } else {
      expect({ gpu: s.recGpuKey, cpu: s.recCpuKey, ram: s.recRamGb }).toEqual(want.rec);
    }
  });

  it('never guesses: VRAM-only and model-less GPU lines stay null', () => {
    for (const id of [1145360, 413150, 105600, 632470, 1794680]) {
      const s = scoreRequirements(parseSteamRequirements(steamFixture(id).pcRequirements));
      expect(s.minGpuScore).toBeNull();
    }
  });
});
