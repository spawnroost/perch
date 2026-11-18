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
  value: string;
}

/** Labelled rows of the About block in a fixed order; rows with no data are left out. */
export function aboutRows(about: Facts['about']): AboutRow[] {
  const extras = [
    about.dlcCount > 0 ? `${count(about.dlcCount)} DLC` : null,
    about.expansionCount > 0 ? plural(about.expansionCount, 'expansion') : null,
  ].filter((s): s is string => s !== null);
  const coop = coopLabels(about.coop);
  const candidates: Array<AboutRow | null> = [
    about.developers.length > 0
      ? {
          label: about.developers.length === 1 ? 'Developer' : 'Developers',
          value: about.developers.join(', '),
        }
      : null,
    about.publishers.length > 0
      ? {
          label: about.publishers.length === 1 ? 'Publisher' : 'Publishers',
          value: about.publishers.join(', '),
        }
      : null,
    about.series ? { label: 'Series', value: about.series } : null,
    about.modes.length > 0 ? { label: 'Modes', value: about.modes.join(', ') } : null,
    about.perspectives.length > 0
      ? { label: 'Perspective', value: about.perspectives.join(', ') }
      : null,
    coop.length > 0 ? { label: 'Co-op', value: coop.join(', ') } : null,
    extras.length > 0 ? { label: 'Extras', value: extras.join(', ') } : null,
  ];
  return candidates.filter((r): r is AboutRow => r !== null);
}
