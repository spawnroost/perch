import cpuTierData from '../../../../data/cpu-tiers.json' with { type: 'json' };
import gpuTierData from '../../../../data/gpu-tiers.json' with { type: 'json' };

export interface TierMatch {
  key: string;
  score: number;
}

interface IndexedEntry {
  match: TierMatch;
  tokens: string[];
}

interface TierTable {
  byKey: Map<string, TierMatch>;
  /** Entries grouped by the first token of their key. */
  byFirstToken: Map<string, IndexedEntry[]>;
}

function buildTable(data: readonly TierMatch[]): TierTable {
  const byKey = new Map<string, TierMatch>();
  const byFirstToken = new Map<string, IndexedEntry[]>();
  for (const match of data) {
    byKey.set(match.key, match);
    const tokens = match.key.split(' ');
    const first = tokens[0] ?? '';
    const bucket = byFirstToken.get(first);
    if (bucket) bucket.push({ match, tokens });
    else byFirstToken.set(first, [{ match, tokens }]);
  }
  return { byKey, byFirstToken };
}

const GPU_TABLE = buildTable(gpuTierData);
const CPU_TABLE = buildTable(cpuTierData);

/** Tokens that make a model a different part when they directly follow a key. */
const VARIANT_TOKENS = new Set([
  'ti',
  'super',
  'xt',
  'xtx',
  'gre',
  'laptop',
  'x',
  'pro',
  'max',
  'ultra',
  'plus',
]);
/** Tokens that make a bare key (e.g. "780m") part of a longer, different model name. */
const PREFIX_TOKENS = new Set(['gtx', 'gt', 'gts', 'rtx', 'rx', 'hd', 'uhd', 'titan', 'mx']);

const DISCRETE_GPU = /^(?:gtx|rtx|rx|gts|gt)\b/;
const LAPTOP_FALLBACK_FACTOR = 0.8;

/** Noise common to Steam requirement lists, WebGL renderer strings and CPU brand strings. */
function stripCommon(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\((?:r|tm)\)|[®™]/g, ' ')
    .replace(/\b(?:vs|ps)_\d_\d\b/g, ' ')
    .replace(
      /direct3d\w*|\bd3d\d+\w*|opengl(?: engine)?|\bangle\b|metal renderer|unspecified version/g,
      ' ',
    )
    .replace(/\b0x[0-9a-f]+\b|\bpcie\b|\bsse2\b|\bmesa\b/g, ' ')
    .replace(/\b\d+(?:\.\d+)?\s*ghz\+?/g, ' ')
    .replace(/\b\d+[- ]?(?:cores?|threads?|bit)\b|\b\d+\s*mb\b/g, ' ')
    .replace(/\(?\b\d+\s*cpus?\b\)?/g, ' ')
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
    .replace(/\blaptop\s+gpu\b/g, 'laptop')
    .replace(/\b\d+(?:\/\d+)*\s*(?:gb|g)\b|\bgddr\w*\b|\bvram\b/g, ' ')
    .replace(/(\d{3,4})(ti|xtx|xt|super|gre|gts|gt)\b/g, '$1 $2')
    .replace(/\b(?:nvidia|geforce|series|graphics)\b/g, ' ')
    .replace(/\bradeon\b(?!\s+vii)/g, ' ')
    .replace(/\b(gtx|gts|gt|rtx|rx|hd|uhd|vega|titan|mx)(?=\d)/g, '$1 ')
    .replace(/\brx vega\b/g, 'vega');
  return finish(s);
}

/** Normalise one CPU name (not a list of alternatives) to its table-key form. */
export function normaliseCpu(raw: string): string {
  const s = stripCommon(raw)
    .replace(/(?<!deck )\bcpu\b|\bprocessor\b|\b(?:gold|silver)\b|\bseries\b/g, ' ')
    .replace(/\b(?:dual|triple|tri|quad|six|hexa|eight|octa|\d+)[- ]core\b/g, ' ')
    .replace(/\bcore\s*2\s+(duo|quad|extreme)\b/g, 'core2 $1')
    .replace(/\bcore\b/g, ' ')
    .replace(/\bi([3579])[\s-]*(m?\d{3,5}[a-z0-9]*)/g, 'i$1-$2')
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
  for (let i = 0; i < tokens.length; i++) {
    const prev = tokens[i - 1];
    if (prev !== undefined && PREFIX_TOKENS.has(prev)) continue;
    for (const entry of table.byFirstToken.get(tokens[i] ?? '') ?? []) {
      const n = entry.tokens.length;
      if (i + n > tokens.length) continue;
      if (!entry.tokens.every((t, j) => tokens[i + j] === t)) continue;
      if (isSuffixBlocked(tokens[i + n])) continue;
      if (
        !best ||
        n > best.tokens.length ||
        (n === best.tokens.length && entry.match.key.length > best.match.key.length)
      ) {
        best = entry;
      }
    }
  }
  return best?.match ?? null;
}

/**
 * Split "A / B", "A or B" and WebGL comma lists into candidates. "w/ ..." and
 * "(4 cores/8 threads)" notes are dropped first; a "/" between digits ("3/6GB") is kept.
 */
function candidates(raw: string): string[] {
  return (
    raw
      .replace(/\([^)]*\b(?:cores?|threads?)\b[^)]*\)/gi, ' ')
      .replace(/\b(?:w\/|with\s+radeon)\s*[^/,|;]*?(?=\bor\b|\band\b|[/,|;]|$)/gi, ' ')
      // "8600/9600GT" lists two cards sharing a suffix.
      .replace(/\b(\d{3,4})\/(\d{3,4})(\s*[a-z]{1,3})\b/gi, '$1$3 / $2$3')
      .split(/(?<!\d)\/|\/(?!\d)|(?<=\d{3})\/(?=\d{3})|[,|;]|\bor\b|\band\b/i)
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

const BARE_MODEL = /^(\d{3,4})( ti| super)?$/;

/**
 * "NVIDIA 2060 Super", "nVidia 450" or "1060": a lone model number gets its GTX / RTX prefix.
 * Only with an NVIDIA/GeForce mention, or a 4-digit GTX 10/16 or RTX 20-50 number; never when
 * AMD/Intel is named (a bare "5570" is not guessable) and only if the prefixed key exists.
 */
function bareNvidia(part: string, norm: string): TierMatch | null {
  const m = BARE_MODEL.exec(norm);
  if (!m || /\b(?:amd|ati|radeon|intel)\b/i.test(part)) return null;
  const n = m[1] ?? '';
  const named = /\b(?:nvidia|geforce)\b/i.test(part);
  if (!named && !/^(?:10|16|20|30|40|50)\d\d$/.test(n)) return null;
  for (const prefix of ['gtx', 'rtx']) {
    const found = findInTable(GPU_TABLE, `${prefix} ${n}${m[2] ?? ''}`);
    if (found) return found;
  }
  return null;
}

/** Match a GPU string to a tier entry; with alternatives, the first that matches wins. */
export function matchGpu(raw: string): TierMatch | null {
  for (const part of candidates(raw)) {
    const norm = normaliseGpu(part);
    const found = findInTable(GPU_TABLE, norm);
    if (found) return found;
    const bare = bareNvidia(part, norm);
    if (bare) return bare;
    if (!/\blaptop\b/.test(norm)) continue;
    // No laptop key: fall back to the base part, discounting discrete GPUs
    // because desktop scores overstate their laptop versions.
    const base = norm.replace(/\s*\blaptop\b/g, '').trim();
    const fallback = findInTable(GPU_TABLE, base);
    if (!fallback) continue;
    return DISCRETE_GPU.test(base)
      ? { key: fallback.key, score: Math.round(fallback.score * LAPTOP_FALLBACK_FACTOR) }
      : fallback;
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
