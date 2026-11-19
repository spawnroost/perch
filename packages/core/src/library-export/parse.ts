import { normaliseName } from '../library/match.js';
import { EXPORT_MAX_GAMES, type ExportGame } from './schemas.js';

export interface ExportFile {
  name: string;
  text: string;
}

export interface ParsedExport {
  games: ExportGame[];
  errors: string[];
}

type Source = ExportGame['source'];
interface Timestamp {
  minutesPlayed?: number;
  lastPlayed?: string;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

/** Epic/GOG/anything else from a store name or a Heroic runner name. */
function sourceOf(value: string | undefined): Source {
  const v = (value ?? '').toLowerCase();
  if (v.includes('epic') || v.includes('legendary')) return 'epic';
  if (v.includes('gog')) return 'gog';
  return 'other';
}

/** A date or date-time without a zone is read as UTC; anything unparseable is dropped. */
function toIso(value: unknown): string | undefined {
  const s = str(value);
  if (!s) return undefined;
  const plain = /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)?$/.test(s);
  const d = new Date(plain ? `${s.replace(' ', 'T')}${s.length > 10 ? '' : 'T00:00:00'}Z` : s);
  return Number.isNaN(d.getTime()) || d.getUTCFullYear() < 1990 ? undefined : d.toISOString();
}

function hmsMinutes(s: string): number | undefined {
  const m = /^(\d+):(\d{1,2})(?::(\d{1,2}))?$/.exec(s);
  return m ? Number(m[1]) * 60 + Number(m[2]) + Number(m[3] ?? 0) / 60 : undefined;
}

// ---- Heroic JSON -------------------------------------------------------------------------------

const isTimestampMap = (o: Record<string, unknown>) => {
  const values = Object.values(o);
  return (
    values.length > 0 &&
    values.every(isRecord) &&
    values.some((v) => 'totalPlayed' in v || 'lastPlayed' in v)
  );
};

function heroicGames(items: unknown[], fallback: Source): ExportGame[] {
  const out: ExportGame[] = [];
  for (const item of items) {
    if (!isRecord(item)) continue;
    const title = str(item.title);
    if (!title || item.is_dlc === true || item.isDlc === true) continue;
    const storeId = str(item.app_name);
    const source = item.runner === undefined ? fallback : sourceOf(str(item.runner));
    out.push({ source, ...(storeId ? { storeId } : {}), title });
  }
  return out;
}

function readTimestamps(o: Record<string, unknown>): Map<string, Timestamp> {
  const out = new Map<string, Timestamp>();
  for (const [app, v] of Object.entries(o)) {
    if (!isRecord(v)) continue;
    const total = Number(v.totalPlayed);
    const lastPlayed = toIso(v.lastPlayed);
    out.set(app, {
      ...(Number.isFinite(total) && total > 0 ? { minutesPlayed: Math.round(total) } : {}),
      ...(lastPlayed ? { lastPlayed } : {}),
    });
  }
  return out;
}

// ---- CSV ---------------------------------------------------------------------------------------

/** RFC-4180 style: quoted fields may hold the delimiter, newlines and "" escapes. */
function csvRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const endRow = () => {
    row.push(cell);
    cell = '';
    if (row.some((c) => c.trim() !== '')) rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') endRow();
    else if (ch !== '\r') cell += ch;
  }
  endRow();
  return rows;
}

function delimiterOf(text: string): string {
  const head = text.slice(0, text.search(/\r?\n/) === -1 ? undefined : text.search(/\r?\n/));
  const counts = [',', ';', '\t'].map((d) => [d, head.split(d).length] as const);
  return counts.sort((a, b) => b[1] - a[1])[0]![0];
}

const flat = (h: string) => h.toLowerCase().replace(/[^a-z0-9]+/g, '');
const findCol = (headers: string[], names: string[]) =>
  headers.findIndex((h) => names.includes(flat(h)));

function csvGames(text: string): ExportGame[] | string {
  const rows = csvRows(text.replace(/^\uFEFF/, ''), delimiterOf(text));
  const headers = rows.shift()?.map((h) => h.trim());
  if (!headers) return 'is empty';
  const name = findCol(headers, ['name', 'title', 'game', 'gamename']);
  if (name === -1) return 'has no name/title/game column';
  let src = findCol(headers, ['source', 'library']);
  if (src === -1) src = findCol(headers, ['platform']);
  const last = findCol(headers, ['lastactivity', 'lastplayed']);
  const play = headers.findIndex((h) => {
    const f = flat(h);
    return f.includes('hour') || f.includes('minute') || ['playtime', 'timeplayed'].includes(f);
  });
  const unit = play === -1 ? '' : flat(headers[play]!);

  const games: ExportGame[] = [];
  for (const r of rows) {
    const title = r[name]?.trim();
    if (!title) continue;
    const raw = play === -1 ? '' : (r[play]?.trim() ?? '');
    let minutes = hmsMinutes(raw);
    if (minutes === undefined && /^\d+(?:\.\d+)?$/.test(raw)) {
      const n = Number(raw);
      minutes = unit.includes('hour') ? n * 60 : unit.includes('minute') ? n : n / 60;
    }
    const lastPlayed = last === -1 ? undefined : toIso(r[last]);
    games.push({
      source: src === -1 ? 'other' : sourceOf(r[src]),
      title,
      ...(minutes && minutes > 0 ? { minutesPlayed: Math.round(minutes) } : {}),
      ...(lastPlayed ? { lastPlayed } : {}),
    });
  }
  return games;
}

// ---- Merge -------------------------------------------------------------------------------------

const keyOf = (g: ExportGame) => `${g.source}:${g.storeId ?? normaliseName(g.title)}`;

function dedupe(games: ExportGame[]): ExportGame[] {
  const seen = new Map<string, ExportGame>();
  for (const g of games) {
    const cur = seen.get(keyOf(g));
    if (!cur) {
      seen.set(keyOf(g), { ...g });
      continue;
    }
    if (g.minutesPlayed && g.minutesPlayed > (cur.minutesPlayed ?? 0))
      cur.minutesPlayed = g.minutesPlayed;
    if (g.lastPlayed && g.lastPlayed > (cur.lastPlayed ?? '')) cur.lastPlayed = g.lastPlayed;
  }
  return [...seen.values()];
}

/**
 * Reads Heroic (`legendary_library.json`, `gog_library.json`, `timestamp.json`) and CSV exports
 * (Playnite Library Exporter, GOG Galaxy exporters, any sheet with a name column). File kind is
 * detected by content. Never throws: problems come back as `errors`.
 */
export function parseLibraryExport(files: readonly ExportFile[]): ParsedExport {
  const errors: string[] = [];
  const games: ExportGame[] = [];
  const stamps = new Map<string, Timestamp>();
  const stampFiles: string[] = [];
  let heroic = 0;

  for (const { name, text } of files) {
    const body = text.replace(/^\uFEFF/, '').trim();
    if (body.startsWith('{') || body.startsWith('[')) {
      let json: unknown;
      try {
        json = JSON.parse(body);
      } catch {
        errors.push(`${name}: not valid JSON`);
        continue;
      }
      if (isRecord(json) && Array.isArray(json.library)) {
        heroic++;
        games.push(...heroicGames(json.library, 'epic'));
      } else if (isRecord(json) && Array.isArray(json.games)) {
        heroic++;
        games.push(...heroicGames(json.games, 'gog'));
      } else if (isRecord(json) && isTimestampMap(json)) {
        stampFiles.push(name);
        for (const [k, v] of readTimestamps(json)) stamps.set(k, v);
      } else errors.push(`${name}: not a Heroic library file or a CSV`);
      continue;
    }
    const parsed = csvGames(body);
    if (typeof parsed === 'string') errors.push(`${name}: ${parsed}`);
    else games.push(...parsed);
  }

  if (stampFiles.length && heroic === 0 && games.length === 0)
    errors.push(
      `${stampFiles.join(', ')}: playtime only, no titles. Add legendary_library.json or gog_library.json too.`,
    );
  for (const g of games) {
    const t = g.storeId ? stamps.get(g.storeId) : undefined;
    if (t) Object.assign(g, t);
  }

  const unique = dedupe(games);
  if (unique.length > EXPORT_MAX_GAMES) {
    errors.push(`Found ${unique.length} games; only the first ${EXPORT_MAX_GAMES} are used.`);
    unique.length = EXPORT_MAX_GAMES;
  }
  return { games: unique, errors };
}
