import { STORE_IDS, type StoreId, type StoreLink } from '@perch/db';

export { STORE_IDS };
export type { StoreId, StoreLink };

/** IGDB `website_types` ids (checked against the live /website_types endpoint, 2026-11-18). */
export const STORE_WEBSITE_TYPE: Readonly<Record<number, StoreId>> = {
  13: 'steam',
  17: 'gog',
  16: 'epic',
  23: 'playstation',
  22: 'xbox',
  24: 'nintendo',
  10: 'app-store', // App Store (iPhone)
  11: 'app-store', // App Store (iPad)
  12: 'google-play',
  15: 'itch',
};

/** Store links among IGDB websites, in IGDB order; other website kinds and non-http urls are dropped. */
export function parseStoreWebsites(
  raw: ReadonlyArray<{ url?: string; type?: number }> | undefined,
): StoreLink[] {
  const out: StoreLink[] = [];
  const seen = new Set<string>();
  for (const w of raw ?? []) {
    const store = w.type === undefined ? undefined : STORE_WEBSITE_TYPE[w.type];
    if (!store || !w.url || !/^https?:\/\//i.test(w.url)) continue;
    const key = `${store} ${w.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ store, url: w.url });
  }
  return out;
}
