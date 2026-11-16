export { buildCandidates, CANDIDATE_CAP } from './candidates.js';
export type { CandidateDeps, CandidateInput } from './candidates.js';
export { createNoneProvider } from './explain.js';
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
export { explainGameForUser, gameFitForUser, recommendForUser } from './for-user.js';
export type { DeviceFit, GameFit, UserEngineDeps, UserRecommendation } from './for-user.js';
