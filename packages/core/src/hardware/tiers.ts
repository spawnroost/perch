import cpuTierData from '../../../../data/cpu-tiers.json' with { type: 'json' };
import gpuTierData from '../../../../data/gpu-tiers.json' with { type: 'json' };

export interface TierMatch {
  key: string;
  score: number;
}

interface IndexedEntry extends TierMatch {
  tokens: string[];
}

interface TierTable {
  byKey: Map<string, TierMatch>;
  entries: IndexedEntry[];
}

function buildTable(data: readonly TierMatch[]): TierTable {
  const byKey = new Map<string, TierMatch>();
  const entries: IndexedEntry[] = [];
  for (const { key, score } of data) {
    byKey.set(key, { key, score });
    entries.push({ key, score, tokens: key.split(' ') });
  }
  return { byKey, entries };
}

const GPU_TABLE = buildTable(gpuTierData);
const CPU_TABLE = buildTable(cpuTierData);

/** Tokens that make a model a different part when they directly follow a key. */
const VARIANT_TOKENS = new Set([
  'ti', 'super', 'xt', 'xtx', 'gre', 'laptop', 'x', 'pro', 'max', 'ultra', 'plus',
]);
/** Tokens that make a bare key (e.g. "780m") part of a longer, different model name. */
const PREFIX_TOKENS = new Set(['gtx', 'gt', 'gts', 'rtx', 'rx', 'hd', 'uhd', 'titan', 'mx']);

/** Noise common to Steam requirement lists, WebGL renderer strings and CPU brand strings. */
function stripCommon(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\((?:r|tm)\)|[®™]/g, ' ')
    .replace(/\b(?:vs|ps)_\d_\d\b/g, ' ')
    .replace(/direct3d\w*|\bd3d\d+\w*|opengl(?: engine)?|\bangle\b|metal renderer|unspecified version/g, ' ')
    .replace(/\b0x[0-9a-f]+\b|\bpcie\b|\bsse2\b|\bmesa\b/g, ' ')
    .replace(/\b\d+(?:\.\d+)?\s*ghz\+?/g, ' ')
    .replace(/@/g, ' ')
    .replace(/\b(?:intel|amd|apple|ati|corporation|edition)\b/g, ' ');
}

function finish(s: string): string {
  const tokens = s
    .replace(/[(),:;"']/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  // "laptop laptop" can appear after "mobile max-q" rewriting
  return tokens.filter((t, i) => t !== tokens[i - 1]).join(' ');
}

/** Normalise one GPU name (not a list of alternatives) to its table-key form. */
export function normaliseGpu(raw: string): string {
  const s = stripCommon(raw)
    .replace(/\bwith max-?q design\b|\bmax-?q\b|\b(?:mobile|notebook)\b/g, ' laptop ')
    .replace(/\blaptop\s+(?:gpu|edition)\b/g, 'laptop')
    .replace(/\b\d+\s*gb\b|\bgddr\w*\b|\bvram\b/g, ' ')
    .replace(/\b(?:nvidia|geforce|series|graphics)\b/g, ' ')
    .replace(/\bradeon\b(?!\s+vii)/g, ' ')
    .replace(/\b(gtx|gts|gt|rtx|rx|hd|uhd|vega|titan|mx)(?=\d)/g, '$1 ')
    .replace(/\brx vega\b/g, 'vega');
  return finish(s);
}

/** Normalise one CPU name (not a list of alternatives) to its table-key form. */
export function normaliseCpu(raw: string): string {
  const s = stripCommon(raw)
    .replace(/\bw\/.*$|\bwith radeon.*$/g, ' ')
    .replace(/(?<!deck )\bcpu\b|\bprocessor\b|\b(?:gold|silver)\b|\bseries\b/g, ' ')
    .replace(/\b(?:dual|triple|tri|quad|six|hexa|eight|octa|\d+)[- ]core\b/g, ' ')
    .replace(/\bcore\s*2\s+(duo|quad|extreme)\b/g, 'core2 $1')
    .replace(/\bcore\b/g, ' ')
    .replace(/\bi([3579])[\s-]*(\d{3,5}[a-z0-9]*)/g, 'i$1-$2')
    .replace(/\bfx[\s-]*(\d{4})/g, 'fx-$1')
    .replace(/\b(ryzen (?:\d|ai \d)) pro\b/g, '$1')
    .replace(/\bmobile\b/g, ' ');
  return finish(s);
}

function isSuffixBlocked(next: string | undefined): boolean {
  return next !== undefined && (VARIANT_TOKENS.has(next) || /^\d|^[a-z]{1,2}\d{3}/.test(next));
}

function findInTable(table: TierTable, norm: string): TierMatch | null {
  const exact = table.byKey.get(norm);
  if (exact) return exact;
  const tokens = norm.split(' ');
  let best: IndexedEntry | null = null;
  for (const entry of table.entries) {
    const n = entry.tokens.length;
    for (let i = 0; i + n <= tokens.length; i++) {
      if (!entry.tokens.every((t, j) => tokens[i + j] === t)) continue;
      const prev = tokens[i - 1];
      if (prev !== undefined && PREFIX_TOKENS.has(prev)) continue;
      if (isSuffixBlocked(tokens[i + n])) continue;
      if (
        !best ||
        n > best.tokens.length ||
        (n === best.tokens.length && entry.key.length > best.key.length)
      ) {
        best = entry;
      }
    }
  }
  return best ? { key: best.key, score: best.score } : null;
}

/** Split "A / B", "A or B", WebGL comma lists and "w/ ..." tails into candidates. */
function candidates(raw: string): string[] {
  return raw
    .replace(/\bw\/.*$/i, '')
    .split(/[/,|;]|\bor\b|\band\b/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Match a GPU string to a tier entry; with alternatives, the first that matches wins. */
export function matchGpu(raw: string): TierMatch | null {
  for (const part of candidates(raw)) {
    const found = findInTable(GPU_TABLE, normaliseGpu(part));
    if (found) return found;
  }
  return null;
}

/** Desktop Intel SKU suffixes (F, KF, KS, S, T) perform like the base part. */
const CPU_SUFFIX_FALLBACKS: Record<string, string[]> = {
  kf: ['k', ''],
  ks: ['k', ''],
  k: [''],
  f: [''],
  s: [''],
  t: [''],
};

function findCpu(norm: string): TierMatch | null {
  const found = findInTable(CPU_TABLE, norm);
  if (found) return found;
  const tokens = norm.split(' ');
  for (let i = 0; i < tokens.length; i++) {
    const m = /^(i[3579]-\d{4,5})(kf|ks|k|f|s|t)$/.exec(tokens[i] ?? '');
    if (!m) continue;
    for (const alt of CPU_SUFFIX_FALLBACKS[m[2] ?? ''] ?? []) {
      const swapped = [...tokens];
      swapped[i] = `${m[1]}${alt}`;
      const hit = findInTable(CPU_TABLE, swapped.join(' '));
      if (hit) return hit;
    }
  }
  return null;
}

/** Match a CPU string to a tier entry; with alternatives, the first that matches wins. */
export function matchCpu(raw: string): TierMatch | null {
  for (const part of candidates(raw)) {
    const found = findCpu(normaliseCpu(part));
    if (found) return found;
  }
  return null;
}
