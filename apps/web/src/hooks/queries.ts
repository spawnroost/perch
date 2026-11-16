import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type {
  DeviceCreate,
  DevicePresetsResponse,
  DeviceView,
  FeedbackBody,
  GameDetailResponse,
  GameSearchResponse,
  HardwareResponse,
  LibraryCreate,
  LibraryEntry,
  RecommendationsResponse,
} from '@perch/core';
import { api } from '@/lib/api';
import { applyFeedback, NO_FEEDBACK, restoreFeedback, type FeedbackMap } from '@/lib/feedback';
import { buildTabs, collectFits, tabDeviceParam, FOR_YOU_LIMIT } from '@/lib/forYou';
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

function recommendationsOptions(device: string, limit: number) {
  return queryOptions({
    queryKey: queryKeys.recommendations(device, limit),
    queryFn: ({ signal }) =>
      api.get<RecommendationsResponse>('/api/recommendations', {
        query: { device, limit },
        signal,
      }),
  });
}

export function useRecommendations(device: string, limit = 5) {
  return useQuery({
    ...recommendationsOptions(device, limit),
    select: (data) => data.recommendations,
  });
}

/** For you: the All feed plus one feed per device, and the per-device fits found across them. */
export function useForYou(devices: readonly DeviceView[]) {
  const tabs = buildTabs(devices);
  return useQueries({
    queries: tabs.map((t) => recommendationsOptions(tabDeviceParam(t.value), FOR_YOU_LIMIT)),
    combine: (results) => ({
      tabs,
      feeds: new Map(tabs.map((t, i) => [t.value, results[i]!] as const)),
      fits: collectFits(results.map((r) => r.data)),
    }),
  });
}

export function useGameDetail(igdbId: number | null) {
  return useQuery({
    queryKey: queryKeys.game(igdbId ?? 0),
    queryFn: ({ signal }) => api.get<GameDetailResponse>(`/api/games/${igdbId}`, { signal }),
    enabled: igdbId !== null,
  });
}

/** Feedback sent this session (client-only; the API has no read route). */
export function useFeedbackState() {
  return useQuery({
    queryKey: queryKeys.feedback,
    queryFn: () => NO_FEEDBACK,
    initialData: NO_FEEDBACK as FeedbackMap,
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

/** Send feedback: optimistic cache update, rollback on error, refetch picks afterwards. */
export function useSendFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: FeedbackBody) => api.post('/api/feedback', body),
    onMutate: ({ igdbId, kind }) => applyFeedback(qc, igdbId, kind),
    onError: (_err, _vars, snapshot) => {
      if (snapshot) restoreFeedback(qc, snapshot);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.recommendationsAll }),
  });
}

export function useAddToLibrary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: LibraryCreate) => api.post<{ entry: LibraryEntry }>('/api/library', body),
    // A new library entry changes the picks too.
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.library }),
        qc.invalidateQueries({ queryKey: queryKeys.recommendationsAll }),
      ]),
  });
}

export function useAddDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: DeviceCreate) => api.post<{ device: DeviceView }>('/api/devices', body),
    // Picks depend on the device list.
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.devices }),
        qc.invalidateQueries({ queryKey: queryKeys.recommendationsAll }),
      ]),
  });
}
