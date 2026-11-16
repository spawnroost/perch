export { buildCandidates, CANDIDATE_CAP } from './candidates.js';
export type { CandidateDeps, CandidateInput } from './candidates.js';
export { createNoneProvider } from './explain.js';
export type { ExplainProvider, ExplainRequest } from './explain.js';
export { buildProfile, weighGames } from './profile.js';
export type { ProfileInput } from './profile.js';
export { cosine, diversify, primaryGenre, rankCandidates, scoreCandidate } from './rank.js';
export type { RankedCandidate } from './rank.js';
export { mergeLibrary, recommend } from './recommend.js';
export type { RecommendDeps, RecommendInput } from './recommend.js';
export { loadRecommendInput } from './load.js';
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
