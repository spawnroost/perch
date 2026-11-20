import { stripTrademarks } from '../library/clean-title.js';
import type { PsnTitle } from './schemas.js';

/** PlayStation names are clean apart from trademark signs and the odd "(PS4)" tag. */
export function cleanPsnTitle(raw: string): string {
  const t = stripTrademarks(raw);
  return t.replace(/\s*\((?:[^()]*\b)?PS[45]\b[^()]*\)\s*$/i, '').trim();
}

/** Played-games categories that are games, with the platform entry they make; null for apps etc. */
export function psnPlatform(category: string | null | undefined): 'ps4' | 'ps5' | null {
  if (category === 'ps5_native_game') return 'ps5';
  if (category === 'ps4_game') return 'ps4';
  return null;
}

const DURATION = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/;

/** Whole minutes in an ISO-8601 duration like PT132H48M23S; 0 for anything unreadable. */
export function parseIsoDurationMinutes(raw: string | null | undefined): number {
  const m = raw ? DURATION.exec(raw) : null;
  if (!m) return 0;
  const [, d, h, min, s] = m;
  const seconds =
    Number(d ?? 0) * 86_400 + Number(h ?? 0) * 3600 + Number(min ?? 0) * 60 + Number(s ?? 0);
  return Math.round(seconds / 60);
}

/** The PS4/PS5 games from a played-games reply, with cleaned names, minutes and last-played. */
export function toPsnTitles(
  titles: readonly {
    titleId: string;
    name: string;
    category?: string | null;
    playDuration?: string | null;
    lastPlayedDateTime?: string | null;
  }[],
): PsnTitle[] {
  const out: PsnTitle[] = [];
  for (const t of titles) {
    const platform = psnPlatform(t.category);
    const name = cleanPsnTitle(t.name);
    if (!platform || !name) continue;
    const played = t.lastPlayedDateTime ? new Date(t.lastPlayedDateTime) : null;
    out.push({
      titleId: t.titleId,
      name,
      platform,
      minutes: parseIsoDurationMinutes(t.playDuration),
      lastPlayed: played && !Number.isNaN(played.getTime()) ? played : null,
    });
  }
  return out;
}
