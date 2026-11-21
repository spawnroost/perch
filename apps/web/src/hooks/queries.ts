import {
  keepPreviousData,
  useInfiniteQuery,
  type InfiniteData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import { useRef } from 'react';
import type {
  AccountResponse,
  BrowseFacetsResponse,
  BrowseResponse,
  SteamSyncResult,
  ExportGame,
  ExportImportResult,
  PsnSyncResult,
  XboxSyncResult,
  AuthProviders,
  DeviceCreate,
  DevicePatchInput,
  DevicePresetsResponse,
  DeviceView,
  FeedbackKind,
  FeedbackListResponse,
  GameDetailResponse,
  GameFitsResponse,
  GameSearchResponse,
  HardwareResponse,
  ImportConfirm,
  ImportPreviewResponse,
  LibraryCreate,
  LibraryEntry,
  LibraryPatchInput,
  PlayedBefore,
  RecommendationsResponse,
  SimilarResponse,
  PlayerVoiceResponse,
  PriceResponse,
  WatchListResponse,
  WatchResponse,
  SoundtrackResponse,
  RouletteResponse,
  TasteSummary,
  SessionQuery,
  SessionResponse,
} from '@perch/core/browser';
import { api } from '@/lib/api';
import { playerVoicePollMs } from '@/lib/playerVoice';
import { createReasonsPoller } from '@/lib/reasonsPoll';
import {
  applyFeedback,
  type FeedbackChange,
  feedbackChange,
  NO_FEEDBACK,
  revertFeedback,
  type FeedbackMap,
} from '@/lib/feedback';
import { BROWSE_LIMIT, nextOffset } from '@/lib/browse';
import { ALL_TAB, FOR_YOU_LIMIT } from '@/lib/forYou';
import { seedGameDetail } from '@/lib/gameSeed';
import { devicesAffected, libraryAffected } from '@/lib/invalidation';
import { withGameRating } from '@/lib/library';
import { resolveBodies, type ResolveBody } from '@/lib/playedBefore';
import { shouldRetry } from '@/lib/retry';
import { queryKeys } from '@/lib/queryKeys';

export function useLibrary(enabled = true) {
  return useQuery({
    queryKey: queryKeys.library,
    queryFn: ({ signal }) => api.get<{ entries: LibraryEntry[] }>('/api/library', { signal }),
    select: (data) => data.entries,
    enabled,
  });
}

export function useTasteCard() {
  return useQuery({
    queryKey: queryKeys.tasteCard,
    queryFn: ({ signal }) => api.get<TasteSummary>('/api/me/taste-card', { signal }),
  });
}

export function useDevices(enabled = true) {
  return useQuery({
    queryKey: queryKeys.devices,
    queryFn: ({ signal }) => api.get<{ devices: DeviceView[] }>('/api/devices', { signal }),
    select: (data) => data.devices,
    enabled,
  });
}

export function useDevicePresets() {
  return useQuery({
    queryKey: queryKeys.presets,
    queryFn: ({ signal }) => api.get<DevicePresetsResponse>('/api/devices/presets', { signal }),
    select: (data) => data.presets,
    staleTime: Infinity,
  });
}

export function useGameSearch(q: string) {
  return useQuery({
    queryKey: queryKeys.gameSearch(q),
    queryFn: ({ signal }) =>
      api.get<GameSearchResponse>('/api/games/search', { query: { q }, signal }),
    select: (data) => data.results,
    enabled: q.length >= 2,
    placeholderData: keepPreviousData,
  });
}

/**
 * Per-device fit and deck category for a result set, one request. `enabled` is false while the
 * results are placeholder or stale, so only the rows on screen are asked about.
 */
export function useSearchFits(igdbIds: readonly number[], enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.gameFits(igdbIds),
    queryFn: ({ signal }) =>
      api.get<GameFitsResponse>('/api/games/fit', {
        query: { ids: [...igdbIds].sort((a, b) => a - b).join(',') },
        signal,
      }),
    enabled: enabled && igdbIds.length > 0,
    // Cold Steam lookups finish in the background; ask again until every row has its fit.
    refetchInterval: (query) => (query.state.data?.pending.length ? 1500 : false),
    staleTime: 5 * 60_000,
    // Client errors (400/401) will not change on a retry.
    retry: shouldRetry,
  });
}

export function useHardwareSuggestions(kind: 'gpus' | 'cpus', q: string) {
  return useQuery({
    queryKey: queryKeys.hardware(kind, q),
    queryFn: ({ signal }) =>
      api.get<HardwareResponse>(`/api/hardware/${kind}`, { query: { q, limit: 8 }, signal }),
    select: (data) => data.results,
    enabled: q.length >= 2,
    placeholderData: keepPreviousData,
  });
}

function recommendationsQuery(device: string, limit: number) {
  return {
    queryKey: queryKeys.recommendations(device, limit),
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      api.get<RecommendationsResponse>('/api/recommendations', {
        query: { device, limit },
        signal,
      }),
    select: (data: RecommendationsResponse) => data.recommendations,
  };
}

/** `keepPrevious` shows the last feed while another device's loads (no skeleton flash on switch). */
export function useRecommendations(
  device: string,
  limit = 5,
  keepPrevious = false,
  enabled = true,
) {
  return useQuery({
    ...recommendationsQuery(device, limit),
    ...(keepPrevious ? { placeholderData: keepPreviousData } : {}),
    enabled,
  });
}

const nextReasonsPoll = createReasonsPoller();

/**
 * The For you feed for a device; switching devices keeps the old picks until the new ones land.
 * While the server is still writing the AI reasons, asks again every 2 s (at most 5 times).
 */
export function useForYouFeed(device: string) {
  return useQuery({
    ...recommendationsQuery(device, FOR_YOU_LIMIT),
    placeholderData: keepPreviousData,
    refetchInterval: (query) =>
      nextReasonsPoll(query, !!query.state.data?.reasonsPending, query.state.dataUpdateCount),
  });
}

/** The genre and theme chips; the lists are fixed, so they are fetched once. */
export function useBrowseFacets() {
  return useQuery({
    queryKey: queryKeys.browseFacets,
    queryFn: ({ signal }) => api.get<BrowseFacetsResponse>('/api/browse/facets', { signal }),
    staleTime: Infinity,
  });
}

/**
 * Games with a chosen genre and theme, a page at a time ("Load more" asks for the next offset).
 * Idle until `enabled`. A new selection starts from nothing (skeleton), never from the last one's games.
 */
export function useBrowse(
  genres: readonly number[],
  themes: readonly number[],
  device: string,
  enabled: boolean,
) {
  return useInfiniteQuery({
    queryKey: queryKeys.browse(genres, themes, device),
    queryFn: ({ pageParam, signal }) =>
      api.get<BrowseResponse>('/api/browse', {
        query: {
          genres: genres.join(','),
          themes: themes.join(','),
          limit: BROWSE_LIMIT,
          offset: pageParam,
          ...(device === ALL_TAB ? {} : { deviceId: device }),
        },
        signal,
      }),
    initialPageParam: 0,
    getNextPageParam: nextOffset,
    select: (data) => data.pages.flatMap((page) => page.recommendations),
    enabled,
  });
}

/** Games like one game, filtered by device; the title comes with the answer. */
export function useSimilar(igdbId: number | null, device: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.similar(igdbId ?? 0, device),
    queryFn: ({ signal }) =>
      api.get<SimilarResponse>(`/api/games/${igdbId}/similar`, { query: { device }, signal }),
    enabled: enabled && igdbId !== null,
  });
}

const SOUNDTRACK_POLL_MS = 5000;
const SOUNDTRACK_MAX_POLLS = 12;

/** Soundtrack album and music links for a game; the album is slow on a first visit, then cached server-side. */
export function useSoundtrack(igdbId: number) {
  return useQuery({
    queryKey: queryKeys.soundtrack(igdbId),
    queryFn: ({ signal }) =>
      api.get<SoundtrackResponse>(`/api/games/${igdbId}/soundtrack`, { signal }),
    staleTime: 10 * 60_000,
    // While the server is still looking the album up, ask again every 5 s for about a minute.
    refetchInterval: (query) =>
      query.state.data?.pending && query.state.dataUpdateCount < SOUNDTRACK_MAX_POLLS
        ? SOUNDTRACK_POLL_MS
        : false,
  });
}

/**
 * Best current PC-store price and historic low. A pending answer (first lookup still running, or
 * CheapShark unavailable) is never kept: it is asked again every 5 s for a minute, and on remount.
 * `waiting` is true until there is an answer or the polls ran out.
 */
export function usePrices(igdbId: number) {
  // Answers received for this game that were still pending; the poll budget counts them.
  const pendingAnswers = useRef<{ igdbId: number; n: number }>({ igdbId, n: 0 });
  if (pendingAnswers.current.igdbId !== igdbId) pendingAnswers.current = { igdbId, n: 0 };
  const budgetLeft = () => pendingAnswers.current.n < SOUNDTRACK_MAX_POLLS;
  const query = useQuery({
    queryKey: queryKeys.prices(igdbId),
    queryFn: async ({ signal }) => {
      const res = await api.get<PriceResponse>(`/api/games/${igdbId}/prices`, { signal });
      pendingAnswers.current.n = res.pending ? pendingAnswers.current.n + 1 : 0;
      return res;
    },
    staleTime: (q) => (q.state.data?.pending ? 0 : 10 * 60_000),
    refetchInterval: (q) => (q.state.data?.pending && budgetLeft() ? SOUNDTRACK_POLL_MS : false),
  });
  const waiting = query.isPending || (query.data?.pending === true && budgetLeft());
  return { ...query, waiting };
}

/** The user's price watches with cached prices; asks again while the server is still looking prices up. */
export function useWatches() {
  return useQuery({
    queryKey: queryKeys.watches,
    queryFn: ({ signal }) => api.get<WatchListResponse>('/api/watches', { signal }),
    refetchInterval: (query) =>
      query.state.data?.watches.some((w) => w.prices === null) && query.state.dataUpdateCount < 6
        ? 4000
        : false,
  });
}

/** Turns the daily price-watch email on or off. */
export function useSetWatchEmails() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) =>
      api.put<{ enabled: boolean }>('/api/watches/emails', { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.watches }),
  });
}

/** Starts a price watch, or changes its target (null = any sale). */
export function useSetWatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ igdbId, targetPrice }: { igdbId: number; targetPrice: number | null }) =>
      api.put<WatchResponse>(`/api/watches/${igdbId}`, { targetPrice }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.watches }),
  });
}

export function useRemoveWatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (igdbId: number) => api.delete<{ ok: true }>(`/api/watches/${igdbId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.watches }),
  });
}

/**
 * AI summary of Steam reviews. The first visit may answer pending while it is written, so it asks
 * again every 2 s for up to a minute; `waiting` is true until it has an answer or the time runs out.
 */
export function usePlayerVoice(igdbId: number) {
  // When the first pending answer for this game arrived; the poll budget counts from it.
  const pendingSince = useRef<{ igdbId: number; at: number } | null>(null);
  const sincePending = () => {
    if (pendingSince.current?.igdbId !== igdbId) pendingSince.current = { igdbId, at: Date.now() };
    return Date.now() - pendingSince.current.at;
  };
  const query = useQuery({
    queryKey: queryKeys.playerVoice(igdbId),
    queryFn: ({ signal }) =>
      api.get<PlayerVoiceResponse>(`/api/games/${igdbId}/player-voice`, { signal }),
    // A pending answer is never fresh: remounting asks again at once.
    staleTime: (q) => (q.state.data?.pending ? 0 : 10 * 60_000),
    refetchInterval: (q) => {
      if (!q.state.data?.pending) {
        pendingSince.current = null;
        return false;
      }
      return playerVoicePollMs(q.state.data, sincePending());
    },
  });
  const waiting =
    query.isPending ||
    (query.data?.pending === true && playerVoicePollMs(query.data, sincePending()) !== false);
  return { ...query, waiting };
}

/** Ranked picks for a play session; idle until `params` is set (no device picked yet). */
export function useSession(params: SessionQuery | null) {
  return useQuery({
    queryKey: queryKeys.session(params),
    queryFn: async ({ signal }) => {
      if (!params) throw new Error('No session params');
      const res = await api.get<SessionResponse>('/api/session', { query: { ...params }, signal });
      // Carry the params so a title can match the cards (not the controls) under keepPreviousData.
      return { ...res, query: params };
    },
    enabled: params !== null,
    placeholderData: keepPreviousData,
  });
}

/** One backlog roulette spin. Each `spin` number is a fresh draw; the result is never reused. */
export function useRouletteSpin(spin: number, params: Record<string, string | number>) {
  return useQuery({
    queryKey: queryKeys.roulette(spin, params),
    queryFn: ({ signal }) => api.get<RouletteResponse>('/api/roulette', { query: params, signal }),
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

/** Seeded from the recommendation or library caches (placeholder data) so the cover shows on the first frame. */
export function useGameDetail(igdbId: number | null) {
  const qc = useQueryClient();
  return useQuery<GameDetailResponse>({
    queryKey: queryKeys.game(igdbId ?? 0),
    queryFn: ({ signal }) => api.get<GameDetailResponse>(`/api/games/${igdbId}`, { signal }),
    enabled: igdbId !== null,
    placeholderData: () => {
      if (igdbId === null) return undefined;
      const feeds = qc
        .getQueriesData<RecommendationsResponse>({ queryKey: queryKeys.recommendationsAll })
        .map(([, data]) => data?.recommendations);
      const browsed = qc
        .getQueriesData<InfiniteData<BrowseResponse, number>>({ queryKey: queryKeys.browseAll })
        .map(([, data]) => data?.pages.flatMap((page) => page.recommendations));
      const library = qc.getQueryData<{ entries: LibraryEntry[] }>(queryKeys.library)?.entries;
      return seedGameDetail(igdbId, [...feeds, ...browsed], library);
    },
  });
}

/**
 * The user's feedback and a `send` that toggles: pressing the kind that is already set undoes it.
 * Updates are optimistic per game; every settled change refetches the picks, feedback and detail.
 */
export function useFeedback() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.feedback,
    queryFn: async ({ signal }) =>
      (await api.get<FeedbackListResponse>('/api/feedback', { signal })).feedback,
  });
  const mutation = useMutation({
    mutationFn: ({ igdbId, kind, undo }: FeedbackChange) =>
      undo
        ? api.delete(`/api/feedback/${igdbId}/${kind}`)
        : api.post('/api/feedback', { igdbId, kind }),
    onMutate: async (change) => ({ previous: await applyFeedback(qc, change) }),
    onError: (_err, change, context) => revertFeedback(qc, change, context?.previous),
    onSettled: (_data, _err, { igdbId }) =>
      Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.feedback }),
        qc.invalidateQueries({ queryKey: queryKeys.recommendationsAll }),
        qc.invalidateQueries({ queryKey: queryKeys.game(igdbId) }),
        qc.invalidateQueries({ queryKey: queryKeys.tasteCard }),
      ]),
  });
  const feedback = query.data ?? NO_FEEDBACK;
  return {
    feedback,
    send: (igdbId: number, kind: FeedbackKind) =>
      mutation.mutate(
        feedbackChange(
          qc.getQueryData<FeedbackMap>(queryKeys.feedback) ?? NO_FEEDBACK,
          igdbId,
          kind,
        ),
      ),
    error: mutation.isError ? mutation.error : null,
  };
}

const invalidateAll = (qc: QueryClient, keys: readonly QueryKey[]) =>
  Promise.all(keys.map((queryKey) => qc.invalidateQueries({ queryKey })));

export function useAddToLibrary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: LibraryCreate) => api.post<{ entry: LibraryEntry }>('/api/library', body),
    // A new library entry changes the picks and the game's page too.
    onSuccess: () => invalidateAll(qc, libraryAffected),
  });
}

export function useUpdateLibraryEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: LibraryPatchInput }) =>
      api.patch<{ entry: LibraryEntry }>(`/api/library/${id}`, patch),
    onSuccess: () => invalidateAll(qc, libraryAffected),
  });
}

/** Sets one status on all of a game's library entries (every platform) in one request. */
export function useSetGameStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ igdbId, status }: { igdbId: number; status: LibraryEntry['status'] }) =>
      api.put<{ status: LibraryEntry['status']; updated: number }>(
        `/api/library/games/${igdbId}/status`,
        { status },
      ),
    onSuccess: () => invalidateAll(qc, libraryAffected),
  });
}

/** Rates a game on all its library entries; the library cache updates at once and rolls back on error. */
export function useRateGame() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ igdbId, rating }: { igdbId: number; rating: number | null }) =>
      api.put<{ rating: number | null }>(`/api/library/games/${igdbId}/rating`, { rating }),
    onMutate: async ({ igdbId, rating }) => {
      await qc.cancelQueries({ queryKey: queryKeys.library });
      const previous = qc.getQueryData<{ entries: LibraryEntry[] }>(queryKeys.library);
      if (previous) {
        qc.setQueryData(queryKeys.library, {
          entries: withGameRating(previous.entries, igdbId, rating),
        });
      }
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(queryKeys.library, ctx.previous);
    },
    onSettled: () => invalidateAll(qc, libraryAffected),
  });
}

export function useRemoveLibraryEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/library/${id}`),
    onSuccess: () => invalidateAll(qc, libraryAffected),
  });
}

export function useImportPreview() {
  return useMutation({
    mutationFn: (text: string) => api.post<ImportPreviewResponse>('/api/library/import', { text }),
  });
}

export function useImportConfirm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ImportConfirm) =>
      api.post<{
        imported: { igdbId: number; name: string }[];
        failed: { igdbId: number; error: string }[];
      }>('/api/library/import/confirm', body),
    onSuccess: () => invalidateAll(qc, libraryAffected),
  });
}

export function useImportExportGames() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (games: ExportGame[]) =>
      api.post<ExportImportResult>('/api/library/import/export', { games }),
    onSuccess: () => invalidateAll(qc, libraryAffected),
  });
}

export function usePlayedBefore(enabled = true) {
  return useQuery({
    queryKey: queryKeys.playedBefore,
    queryFn: ({ signal }) =>
      api.get<{ entries: PlayedBefore[] }>('/api/library/played-before', { signal }),
    select: (data) => data.entries,
    enabled,
  });
}

/**
 * Answers the played-before prompt: `pausedIds` become Paused, `keptIds` stay and are not asked
 * about again. One mutation (a few requests for a huge list), so it finishes even if the sheet
 * unmounts.
 */
export function useResolvePlayedBefore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ pausedIds, keptIds }: ResolveBody) => {
      for (const body of resolveBodies(pausedIds, keptIds))
        await api.post<{ paused: number; kept: number }>(
          '/api/library/played-before/resolve',
          body,
        );
    },
    onSettled: () => invalidateAll(qc, libraryAffected),
  });
}

export function useAddDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: DeviceCreate) => api.post<{ device: DeviceView }>('/api/devices', body),
    // Picks depend on the device list.
    onSuccess: () => invalidateAll(qc, devicesAffected),
  });
}

export function useUpdateDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: DevicePatchInput }) =>
      api.patch<{ device: DeviceView }>(`/api/devices/${id}`, patch),
    onSuccess: () => invalidateAll(qc, devicesAffected),
  });
}

/** Deletes a device; the API promotes a new default when the default goes. */
export function useDeleteDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/devices/${id}`),
    onSettled: () => invalidateAll(qc, devicesAffected),
  });
}

const STEAM_ONLY: AuthProviders = { google: false, discord: false, steam: true };

/** Which sign-in providers the API has enabled. Steam only until it answers; `failed` if it can't. */
export function useAuthProviders(): { providers: AuthProviders; failed: boolean } {
  const { data, isError } = useQuery({
    queryKey: queryKeys.authProviders,
    queryFn: ({ signal }) => api.get<AuthProviders>('/api/auth-providers', { signal }),
    staleTime: 5 * 60_000,
  });
  return { providers: data ?? STEAM_ONLY, failed: isError };
}

export function useAccount() {
  return useQuery({
    queryKey: queryKeys.account,
    queryFn: ({ signal }) => api.get<AccountResponse>('/api/account', { signal }),
  });
}

export function useSyncSteamLibrary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<SteamSyncResult>('/api/library/steam/sync'),
    onSuccess: () => invalidateAll(qc, [...libraryAffected, queryKeys.account]),
  });
}

export function useUnlinkSteam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ ok: true }>('/api/account/steam/unlink'),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.account }),
  });
}

/** The link persists even when the first import fails (private history), so refresh the account either way. Xbox and PSN. */
function refreshLinkedStore(qc: QueryClient) {
  return invalidateAll(qc, [...libraryAffected, queryKeys.account]);
}

export function useLinkXbox() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (gamertag: string) =>
      api.post<XboxSyncResult>('/api/library/xbox/link', { gamertag }),
    onSettled: () => refreshLinkedStore(qc),
  });
}

export function useSyncXbox() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<XboxSyncResult>('/api/library/xbox/sync'),
    onSettled: () => refreshLinkedStore(qc),
  });
}

export function useUnlinkXbox() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete('/api/library/xbox'),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.account }),
  });
}

export function useLinkPsn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (onlineId: string) =>
      api.post<PsnSyncResult>('/api/library/psn/link', { onlineId }),
    onSettled: () => refreshLinkedStore(qc),
  });
}

export function useSyncPsn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<PsnSyncResult>('/api/library/psn/sync'),
    onSettled: () => refreshLinkedStore(qc),
  });
}

export function useUnlinkPsn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete('/api/library/psn'),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.account }),
  });
}
