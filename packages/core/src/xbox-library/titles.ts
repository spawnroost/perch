import { stripTrademarks } from '../library/clean-title.js';
import type { XboxTitle } from './schemas.js';

/**
 * Xbox/Microsoft Store names carry store noise: "Dishonored® Definitive Edition (PC)",
 * "Goat Simulator Windows 10", "Gears of War: Ultimate Edition for Windows 10",
 * "Metal: Hellsinger (Xbox Series X|S & PC)". Strips it so the name can match IGDB.
 */
export function cleanXboxTitle(raw: string): string {
  let t = stripTrademarks(raw);
  // Trailing "(PC)", "(Xbox One)", "(Xbox Series X|S & PC)", "(Windows 10)"; repeat for stacked ones.
  for (let prev = ''; prev !== t;) {
    prev = t;
    t = t.replace(/\s*\((?:[^()]*\b)?(?:PC|Xbox|Windows)\b[^()]*\)\s*$/i, '');
  }
  t = t
    .replace(/\s+for\s+Windows\s+10\s*$/i, '')
    .replace(/\s+[-–]\s*Windows(?:\s+10)?(?:\s+Edition)?\s*$/i, '')
    .replace(/\s+Windows\s+10(?:\s+Edition)?\s*$/i, '');
  return t.replace(/\s+/g, ' ').trim();
}

/** Xbox consoles in the device list make it an Xbox game; PC-only (Windows, Win32) is PC. */
export function xboxPlatform(devices: readonly string[] | null | undefined): 'xbox' | 'pc' {
  return devices?.some((d) => /^xbox/i.test(d)) ? 'xbox' : 'pc';
}

/** The `type: "Game"`, visible titles from a title-history reply, with cleaned names. */
export function toXboxTitles(
  titles: readonly {
    titleId: string;
    name: string;
    type?: string | null;
    devices?: readonly string[] | null;
    titleHistory?: { lastTimePlayed?: string | null; visible?: boolean | null } | null;
    achievement?: { progressPercentage?: number | null } | null;
  }[],
): XboxTitle[] {
  const out: XboxTitle[] = [];
  for (const t of titles) {
    if (t.type !== 'Game' || t.titleHistory?.visible === false) continue;
    const name = cleanXboxTitle(t.name);
    if (!name) continue;
    const played = t.titleHistory?.lastTimePlayed ? new Date(t.titleHistory.lastTimePlayed) : null;
    out.push({
      titleId: t.titleId,
      name,
      platform: xboxPlatform(t.devices),
      lastPlayed: played && !Number.isNaN(played.getTime()) ? played : null,
      achievementProgress: t.achievement?.progressPercentage ?? 0,
    });
  }
  return out;
}
