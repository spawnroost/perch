import type { SoundtrackTrack } from '@perch/core/browser';

/** "m:ss" for a track length; empty when unknown. */
export function formatTrackTime(ms: number | null): string {
  if (ms === null) return '';
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Tracks as list rows; `preview` is set only for https clips, so nothing else reaches the audio element. */
export function playableTracks(tracks: readonly SoundtrackTrack[]) {
  return tracks.map((t) => ({
    ...t,
    preview: t.previewUrl?.startsWith('https://') ? t.previewUrl : null,
  }));
}
