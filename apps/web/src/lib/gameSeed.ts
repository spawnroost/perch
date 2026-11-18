import type { GameDetailResponse, LibraryEntry, RecommendationsResponse } from '@perch/core';

type Recommendation = RecommendationsResponse['recommendations'][number];

/**
 * A provisional game detail built from what the clicked card already knows (a recommendation, else a
 * library entry), so the detail cover and hero render on the first frame. Fields the card lacks are
 * empty; the caller treats the result as placeholder data until the real response arrives.
 */
export function seedGameDetail(
  igdbId: number,
  feeds: ReadonlyArray<readonly Recommendation[] | undefined>,
  library: readonly LibraryEntry[] | undefined,
): GameDetailResponse | undefined {
  const noFacts: GameDetailResponse['facts'] = {
    critic: null,
    steamReviews: null,
    stores: [],
    links: [],
    about: {
      developers: [],
      publishers: [],
      modes: [],
      perspectives: [],
      coop: null,
      dlcCount: 0,
      expansionCount: 0,
      series: null,
    },
    timeToBeat: null,
  };
  const base = { slug: '', summary: null, platforms: [], ratingCount: null, steamAppId: null };
  for (const feed of feeds) {
    const rec = feed?.find((r) => r.game.igdbId === igdbId);
    if (!rec) continue;
    const { game } = rec;
    return {
      game: { ...base, ...game },
      fit: rec.fits,
      timeToBeat: rec.timeToBeat,
      deck: rec.deck,
      facts: noFacts,
      why: [],
    };
  }
  const entry = library?.find((e) => e.igdbId === igdbId);
  if (!entry) return undefined;
  return {
    game: {
      ...base,
      igdbId: entry.igdbId,
      name: entry.name,
      coverUrl: entry.coverUrl,
      coverUrlSmall: entry.coverUrlSmall,
      heroUrl: entry.heroUrl,
      accent: entry.accent,
      firstRelease: null,
      rating: null,
    },
    fit: [],
    timeToBeat: null,
    deck: null,
    facts: noFacts,
    why: [],
  };
}
