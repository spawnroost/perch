import { matchCpu, matchGpu } from '../hardware/index.js';

/** Raw hardware strings plus RAM as read from one requirements block. */
export interface ParsedSide {
  gpuRaw?: string;
  cpuRaw?: string;
  ramGb?: number;
}

export interface ParsedRequirements {
  min: ParsedSide;
  rec: ParsedSide | null;
}

export interface RequirementScores {
  minGpuScore: number | null;
  minCpuScore: number | null;
  minRamGb: number | null;
  recGpuScore: number | null;
  recCpuScore: number | null;
  recRamGb: number | null;
  /** Matched tier-table keys (for display / debugging). */
  minGpuKey: string | null;
  minCpuKey: string | null;
  recGpuKey: string | null;
  recCpuKey: string | null;
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  reg: '',
  trade: '',
  copy: '',
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code =
        e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** HTML -> trimmed non-empty text lines (one per <br>, <li>, <p>). */
export function htmlToLines(html: string): string[] {
  const text = html
    .replace(/<\s*(br|\/li|\/p|\/ul|li|p|ul)\b[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, '');
  return decodeEntities(text)
    .replace(/[®™©]/g, '')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/** "8 GB RAM", "8192 MB", "2.5GB", "1,024 MB" -> GB. Undefined when no unit is given. */
export function parseRamGb(text: string): number | undefined {
  const m = /(\d[\d,]*(?:\.\d+)?)\s*(gb|gigabytes?|mb|megabytes?)\b/i.exec(text);
  if (!m) return undefined;
  const n = Number((m[1] ?? '').replace(/,/g, ''));
  if (!Number.isFinite(n) || n <= 0) return undefined;
  const gb = /^g/i.test(m[2] ?? '') ? n : n / 1024;
  return Math.round(gb * 1000) / 1000;
}

const LABELS: Array<[RegExp, 'cpuRaw' | 'ramText' | 'gpuRaw']> = [
  [/^(?:processor|cpu)$/i, 'cpuRaw'],
  [/^(?:system\s+)?(?:memory|ram)$/i, 'ramText'],
  [/^(?:graphics(?:\s+card)?|video(?:\s+card)?|gpu)$/i, 'gpuRaw'],
];

/** Pulls processor / memory / graphics out of one Steam requirements HTML block. */
export function parseRequirementsHtml(html: string): ParsedSide {
  const out: ParsedSide = {};
  let ramText: string | undefined;
  const lines = htmlToLines(html);
  for (const line of lines) {
    const m = /^([A-Za-z][A-Za-z ]{1,24}?)\s*\*?\s*:\s*(.+)$/.exec(line);
    if (!m) continue;
    const label = (m[1] ?? '').trim();
    const value = (m[2] ?? '').trim();
    const field = LABELS.find(([re]) => re.test(label))?.[1];
    if (!field || !value) continue;
    if (field === 'ramText') ramText ??= value;
    else out[field] ??= value;
  }
  if (ramText !== undefined) {
    const gb = parseRamGb(ramText);
    if (gb !== undefined) out.ramGb = gb;
  } else {
    // Prose style: "1.7 GHz Processor, 512MB RAM, ..." (old Valve games).
    const prose = /(\d[\d,]*(?:\.\d+)?\s*(?:gb|mb))\s*(?:of\s+)?ram\b/i.exec(lines.join(' '));
    const gb = prose ? parseRamGb(prose[1] ?? '') : undefined;
    if (gb !== undefined) out.ramGb = gb;
  }
  return out;
}

const hasData = (p: ParsedSide) =>
  p.gpuRaw !== undefined || p.cpuRaw !== undefined || p.ramGb !== undefined;

/** A line starting "Recommended:" after other content (old games put both in `minimum`). */
function splitInlineRecommended(html: string): [string, string | null] {
  const m = /<[^>]*>\s*(?:<[^>]*>\s*)*Recommended\s*:/i.exec(html);
  if (!m || m.index === 0 || html.slice(0, m.index).replace(/<[^>]*>|\s/g, '').length === 0) {
    return [html, null];
  }
  return [html.slice(0, m.index), html.slice(m.index)];
}

/** Parses Steam's `pc_requirements` (an object, or `[]` when there are none). */
export function parseSteamRequirements(pc: unknown): ParsedRequirements {
  if (!pc || typeof pc !== 'object' || Array.isArray(pc)) return { min: {}, rec: null };
  const { minimum, recommended } = pc as { minimum?: string | null; recommended?: string | null };
  let minHtml = typeof minimum === 'string' ? minimum : '';
  let recHtml = typeof recommended === 'string' && recommended.trim() ? recommended : null;
  if (recHtml === null) {
    const [head, tail] = splitInlineRecommended(minHtml);
    minHtml = head;
    recHtml = tail;
  }
  const rec = recHtml === null ? null : parseRequirementsHtml(recHtml);
  return { min: parseRequirementsHtml(minHtml), rec: rec && hasData(rec) ? rec : null };
}

/** Scores each side with the tier matcher. Unmatched / missing values are null, never guessed. */
export function scoreRequirements(parsed: ParsedRequirements): RequirementScores {
  const side = (p: ParsedSide | null) => {
    const gpu = p?.gpuRaw ? matchGpu(p.gpuRaw) : null;
    const cpu = p?.cpuRaw ? matchCpu(p.cpuRaw) : null;
    return { gpu, cpu, ram: p?.ramGb ?? null };
  };
  const min = side(parsed.min);
  const rec = side(parsed.rec);
  return {
    minGpuScore: min.gpu?.score ?? null,
    minCpuScore: min.cpu?.score ?? null,
    minRamGb: min.ram,
    recGpuScore: rec.gpu?.score ?? null,
    recCpuScore: rec.cpu?.score ?? null,
    recRamGb: rec.ram,
    minGpuKey: min.gpu?.key ?? null,
    minCpuKey: min.cpu?.key ?? null,
    recGpuKey: rec.gpu?.key ?? null,
    recCpuKey: rec.cpu?.key ?? null,
  };
}
