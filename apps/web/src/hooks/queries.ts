import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import type {
  AccountResponse,
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
  RecommendationsResponse,
  SimilarResponse,
  SessionQuery,
  SessionResponse,
} from '@perch/core';
import { api } from '@/lib/api';
import {
  applyFeedback,
  type FeedbackChange,
  feedbackChange,
  NO_FEEDBACK,
  revertFeedback,
  type FeedbackMap,
} from '@/lib/feedback';
import { FOR_YOU_LIMIT } from '@/lib/forYou';
import { seedGameDetail } from '@/lib/gameSeed';
import { devicesAffected, libraryAffected } from '@/lib/invalidation';
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
    select: (data) => data.fits,
    enabled: enabled && igdbIds.length > 0,
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

/** The For you feed for a device; switching devices keeps the old picks until the new ones land. */
export const useForYouFeed = (device: string) => useRecommendations(device, FOR_YOU_LIMIT, true);

/** Games like one game, filtered by device; the title comes with the answer. */
export function useSimilar(igdbId: number | null, device: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.similar(igdbId ?? 0, device),
    queryFn: ({ signal }) =>
      api.get<SimilarResponse>(`/api/games/${igdbId}/similar`, { query: { device }, signal }),
    enabled: enabled && igdbId !== null,
  });
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
      const library = qc.getQueryData<{ entries: LibraryEntry[] }>(queryKeys.library)?.entries;
      return seedGameDetail(igdbId, feeds, library);
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

/** Which sign-in providers the API has enabled; Steam only until it answers. */
export function useAuthProviders(): AuthProviders {
  const { data } = useQuery({
    queryKey: queryKeys.authProviders,
    queryFn: ({ signal }) => api.get<AuthProviders>('/api/auth-providers', { signal }),
    staleTime: Infinity,
  });
  return data ?? STEAM_ONLY;
}

export function useAccount() {
  return useQuery({
    queryKey: queryKeys.account,
    queryFn: ({ signal }) => api.get<AccountResponse>('/api/account', { signal }),
  });
}

export function useUnlinkSteam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ ok: true }>('/api/account/steam/unlink'),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.account }),
  });
}
