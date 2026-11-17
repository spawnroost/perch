import type {
  Device,
  DeviceView,
  LibraryEntry,
  LibraryRow,
  RecommendationsResponse,
  UserRecommendation,
} from '@perch/core';

export const iso = (d: Date | null) => (d ? d.toISOString() : null);

export function libraryDto(r: LibraryRow): LibraryEntry {
  return {
    id: r.id,
    igdbId: r.igdbId,
    name: r.name,
    coverUrl: r.coverUrl,
    coverUrlSmall: r.coverUrlSmall,
    heroUrl: r.heroUrl,
    accent: r.accent,
    platform: r.platform,
    hoursPlayed: r.hoursPlayed,
    lastPlayed: iso(r.lastPlayed),
    status: r.status as LibraryEntry['status'],
    owned: r.owned,
    source: r.source,
    addedAt: r.addedAt.toISOString(),
  };
}

export function deviceDto(d: Device): DeviceView {
  return {
    id: d.id,
    kind: d.kind,
    name: d.name,
    platformIds: d.platformIds,
    gpuName: d.gpuName,
    gpuScore: d.gpuScore,
    cpuName: d.cpuName,
    cpuScore: d.cpuScore,
    ramGb: d.ramGb,
    isDefault: d.isDefault,
    createdAt: d.createdAt.toISOString(),
  };
}

export function recommendationDto(
  r: UserRecommendation,
): RecommendationsResponse['recommendations'][number] {
  return {
    rank: r.rank,
    score: r.score,
    backlog: r.backlog,
    reason: r.reason,
    sourceGame: r.sourceGame,
    game: {
      igdbId: r.game.igdbId,
      name: r.game.name,
      coverUrl: r.coverUrl,
      coverUrlSmall: r.coverUrlSmall,
      heroUrl: r.heroUrl,
      accent: r.accent,
      firstRelease: iso(r.game.firstRelease),
      rating: r.game.rating,
    },
    ...(r.fit ? { fit: r.fit } : {}),
    fits: r.fits,
    deck: r.deck,
    timeToBeat: r.timeToBeat,
  };
}
