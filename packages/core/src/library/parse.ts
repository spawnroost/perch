import { dateField, hoursField, statusField, type Status } from './fields.js';

export interface ImportEntry {
  name: string;
  hours?: number;
  lastPlayed?: Date;
  status?: Status;
}

export type ParsedLine = { ok: true; value: ImportEntry } | { ok: false; error: string };

/** Parses `Name | hours | last-date | status`. Returns null for blank/comment lines. */
export function parseImportLine(raw: string): ParsedLine | null {
  // Only whole-line comments: game names may contain '#'.
  const line = raw.trim();
  if (!line || line.startsWith('#')) return null;
  const parts = line.split('|').map((p) => p.trim());
  if (parts.length > 4) return { ok: false, error: 'too many fields (max 4)' };
  const [name, hours, last, status] = parts;
  if (!name) return { ok: false, error: 'missing game name' };

  const value: ImportEntry = { name };
  if (hours) {
    const r = hoursField.safeParse(hours);
    if (!r.success) return { ok: false, error: `bad hours "${hours}"` };
    value.hours = r.data;
  }
  if (last) {
    const r = dateField.safeParse(last);
    if (!r.success) return { ok: false, error: `bad date "${last}" (expected YYYY-MM-DD)` };
    value.lastPlayed = r.data;
  }
  if (status) {
    const r = statusField.safeParse(status);
    if (!r.success) return { ok: false, error: `bad status "${status}"` };
    value.status = r.data;
  }
  return { ok: true, value };
}

export function parseImportFile(text: string): {
  entries: { line: number; value: ImportEntry }[];
  errors: { line: number; error: string }[];
} {
  const entries: { line: number; value: ImportEntry }[] = [];
  const errors: { line: number; error: string }[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const r = parseImportLine(raw);
    if (!r) return;
    if (r.ok) entries.push({ line: i + 1, value: r.value });
    else errors.push({ line: i + 1, error: r.error });
  });
  return { entries, errors };
}
