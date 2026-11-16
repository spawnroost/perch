import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import type {
  DeviceCreate,
  DevicePatchInput,
  DevicePresetsResponse,
  DeviceView,
  FeedbackKind,
  FeedbackListResponse,
  GameDetailResponse,
  GameSearchResponse,
  HardwareResponse,
  ImportConfirm,
  ImportPreviewResponse,
  LibraryCreate,
  LibraryEntry,
  LibraryPatchInput,
  RecommendationsResponse,
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
import { devicesAffected, libraryAffected } from '@/lib/invalidation';
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

export function useRecommendations(device: string, limit = 5) {
  return useQuery({
    queryKey: queryKeys.recommendations(device, limit),
    queryFn: ({ signal }) =>
      api.get<RecommendationsResponse>('/api/recommendations', {
        query: { device, limit },
        signal,
      }),
    select: (data) => data.recommendations,
  });
}

export function useGameDetail(igdbId: number | null) {
  return useQuery({
    queryKey: queryKeys.game(igdbId ?? 0),
    queryFn: ({ signal }) => api.get<GameDetailResponse>(`/api/games/${igdbId}`, { signal }),
    enabled: igdbId !== null,
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

/** Deletes a device; `promoteId` (see `successorDefault`) becomes the default when the default goes. */
export function useDeleteDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, promoteId }: { id: string; promoteId: string | null }) => {
      await api.delete(`/api/devices/${id}`);
      if (promoteId) await api.patch(`/api/devices/${promoteId}`, { isDefault: true });
    },
    onSettled: () => invalidateAll(qc, devicesAffected),
  });
}
