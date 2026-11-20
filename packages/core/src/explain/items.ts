import type { RecommendationsResponse } from '../schemas/recommendations.js';
import { MAX_SHARED_LABELS } from '../engine/explain.js';
import { REASON_TOP_N, type ReasonItem } from './schemas.js';

type Rec = RecommendationsResponse['recommendations'][number];

function fitHint(rec: Rec): string | undefined {
  if (rec.fit?.status === 'yellow') return 'may need low settings on their devices';
  return undefined;
}

/** The first `limit` picks as model input, built only from what the recommendation already holds. */
export function buildReasonItems(recs: readonly Rec[], limit = REASON_TOP_N): ReasonItem[] {
  return recs.slice(0, limit).map((rec) => {
    const fit = fitHint(rec);
    return {
      igdbId: rec.game.igdbId,
      name: rec.game.name,
      closestLibraryGames: rec.sourceGame ? [rec.sourceGame.name] : [],
      sharedTags: (rec.sharedTags ?? []).slice(0, MAX_SHARED_LABELS),
      ...(fit ? { fit } : {}),
    };
  });
}
