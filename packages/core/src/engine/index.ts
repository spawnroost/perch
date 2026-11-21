export { buildCandidates, CANDIDATE_CAP } from './candidates.js';
export type { CandidateDeps, CandidateInput } from './candidates.js';
export { closestSource, createNoneProvider, likeReason } from './explain.js';
export type { ExplainProvider, ExplainRequest } from './explain.js';
export { buildProfile, weighGames } from './profile.js';
export type { ProfileInput } from './profile.js';
export {
  computeIdf,
  cosine,
  diversify,
  primaryGenre,
  rankCandidates,
  scoreCandidate,
} from './rank.js';
export type { RankedCandidate } from './rank.js';
export { bestFit, deviceFit, deviceFitDetail, deviceKind, platformMatches } from './filters.js';
export type {
  BestFit,
  DeckCategory,
  FilterDevice,
  FitDetail,
  FitInfo,
  FitOptions,
  FitRequirements,
  FitStatus,
} from './filters.js';
export { matchesMood, MOODS, pickFromBacklog, ROULETTE_POOL, QUICK_MAX_HOURS } from './roulette.js';
export type { Mood, Relaxed, RouletteGame, RouletteInput, RoulettePick } from './roulette.js';
export { SIMILAR_LIMIT, similarTo } from './similar.js';
export type { SimilarInput } from './similar.js';
export { mergeLibrary, recommend, similaritySources } from './recommend.js';
export type { RecommendDeps, RecommendInput } from './recommend.js';
export { createFitFetchers, loadDevices, loadRecommendInput } from './load.js';
export type {
  Candidate,
  EngineGame,
  FeedbackItem,
  FeedbackKind,
  LibraryItem,
  RawGame,
  Recommendation,
  TasteProfile,
  Vocab,
  WeightedGame,
} from './types.js';
export { hiddenIds, isBacklog } from './visibility.js';
export { batteryMatters, isBatteryAwareKind, rankForSession } from './session.js';
export type { SessionDevice, SessionOptions, SessionRanked, SessionRec } from './session.js';
export {
  browseForUser,
  explainGameForUser,
  gameFitForUser,
  gameFitsForUser,
  type GameFitsResult,
  recommendForUser,
  rouletteForUser,
  sessionForUser,
  similarForUser,
} from './for-user.js';
export type { DeviceFit, GameFit, UserEngineDeps, UserRecommendation } from './for-user.js';
export { browse, BROWSE_POOL, createBrowseList } from './browse.js';
export type { BrowseInput, BrowseList, BrowsePage } from './browse.js';
