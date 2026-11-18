import type { GameDetailResponse } from '@perch/core';

type Facts = GameDetailResponse['facts'];
type StoreId = Facts['stores'][number]['store'];

const count = (n: number) => n.toLocaleString('en-US');
const plural = (n: number, one: string, many = `${one}s`) => `${count(n)} ${n === 1 ? one : many}`;

/** Big score plus a "41 critics" caption; null with no critic data. */
export function criticSummary(critic: Facts['critic']): { score: string; caption: string } | null {
  if (!critic) return null;
  return {
    score: String(critic.score),
    caption: critic.count ? plural(critic.count, 'critic') : 'Critics',
  };
}

/** Steam's review verdict, percent, total and the Steam reviews page (null without a Steam app id). */
export function steamReviewsSummary(
  reviews: Facts['steamReviews'],
  steamAppId: number | null,
): { desc: string; score: string; total: string; url: string | null } | null {
  if (!reviews) return null;
  return {
    desc: reviews.desc,
    score: `${reviews.pct}%`,
    total: plural(reviews.total, 'review'),
    url:
      steamAppId === null
        ? null
        : `https://store.steampowered.com/app/${steamAppId}#app_reviews_hash`,
  };
}

const STORE_LABELS: Record<StoreId, string> = {
  steam: 'Steam',
  gog: 'GOG',
  epic: 'Epic Games',
  playstation: 'PlayStation Store',
  xbox: 'Xbox',
  nintendo: 'Nintendo eShop',
  'app-store': 'App Store',
  'google-play': 'Google Play',
  itch: 'itch.io',
};

export const storeLabel = (store: StoreId): string => STORE_LABELS[store];

/** The url when it is plain http(s), else null: guards external links against odd schemes. */
export function externalUrl(url: string): string | null {
  try {
    const { protocol } = new URL(url);
    return protocol === 'https:' || protocol === 'http:' ? url : null;
  } catch {
    return null;
  }
}

/** One label per true co-op flag, in a fixed order. */
export function coopLabels(coop: Facts['about']['coop']): string[] {
  if (!coop) return [];
  const out: string[] = [];
  if (coop.campaign) out.push('Campaign co-op');
  if (coop.online) {
    out.push(
      coop.onlineMax && coop.onlineMax > 1
        ? `Online co-op up to ${coop.onlineMax}`
        : 'Online co-op',
    );
  }
  if (coop.local) out.push('Local co-op');
  if (coop.splitscreen) out.push('Split-screen');
  return out;
}

export interface AboutRow {
  label: string;
  /** null when unknown: the UI shows a muted "Unknown" so every game has the same rows. */
  value: string | null;
}

const joined = (items: readonly string[]) => (items.length > 0 ? items.join(', ') : null);
const countOrNull = (n: number) => (n > 0 ? count(n) : null);

/** The Details rows: always the same eight, in a fixed order; a row with no data has a null value. */
export function aboutRows(about: Facts['about']): AboutRow[] {
  return [
    { label: about.developers.length > 1 ? 'Developers' : 'Developer', value: joined(about.developers) },
    { label: about.publishers.length > 1 ? 'Publishers' : 'Publisher', value: joined(about.publishers) },
    { label: 'Series', value: about.series },
    { label: 'Modes', value: joined(about.modes) },
    { label: 'Perspective', value: joined(about.perspectives) },
    { label: 'Co-op', value: joined(coopLabels(about.coop)) },
    { label: 'DLC', value: countOrNull(about.dlcCount) },
    { label: 'Expansions', value: countOrNull(about.expansionCount) },
  ];
}
