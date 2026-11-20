import type { PlayerVoiceResponse } from '@perch/core/browser';

export const PLAYER_VOICE_POLL_MS = 2000;
/** Covers the server's 40 s summarizer timeout plus the Steam fetch. */
export const PLAYER_VOICE_MAX_WAIT_MS = 60_000;

/**
 * How long to wait before asking again while the server writes the summary; false to stop.
 * `sincePendingMs` is the time since the first pending answer.
 */
export function playerVoicePollMs(
  data: Pick<PlayerVoiceResponse, 'pending'> | undefined,
  sincePendingMs: number,
): number | false {
  return data?.pending && sincePendingMs < PLAYER_VOICE_MAX_WAIT_MS ? PLAYER_VOICE_POLL_MS : false;
}

export interface VoiceGroup {
  kind: 'likes' | 'complaints';
  label: string;
  items: string[];
}

/** The non-empty Likes / Complaints lists in display order. */
export function voiceGroups(voice: NonNullable<PlayerVoiceResponse['voice']>): VoiceGroup[] {
  const groups: VoiceGroup[] = [
    { kind: 'likes', label: 'Players like', items: voice.likes },
    { kind: 'complaints', label: 'Players complain about', items: voice.complaints },
  ];
  return groups.filter((g) => g.items.length > 0);
}
