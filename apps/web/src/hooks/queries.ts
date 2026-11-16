import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  DeviceCreate,
  DevicePresetsResponse,
  DeviceView,
  GameSearchResponse,
  HardwareResponse,
  LibraryCreate,
  LibraryEntry,
  RecommendationsResponse,
} from '@perch/core';
import { api } from '@/lib/api';
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

export function useAddToLibrary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: LibraryCreate) => api.post<{ entry: LibraryEntry }>('/api/library', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.library }),
  });
}

export function useAddDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: DeviceCreate) => api.post<{ device: DeviceView }>('/api/devices', body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.devices });
      // Picks depend on the device list.
      await qc.invalidateQueries({ queryKey: ['recommendations'] });
    },
  });
}
