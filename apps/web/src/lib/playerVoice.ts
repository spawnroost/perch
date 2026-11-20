import type { PlayerVoiceResponse } from '@perch/core/browser';

export const PLAYER_VOICE_POLL_MS = 2000;
export const PLAYER_VOICE_MAX_POLLS = 5;

/** How long to wait before asking again while the server writes the summary; false to stop. */
export function playerVoicePollMs(
  data: Pick<PlayerVoiceResponse, 'pending'> | undefined,
  updateCount: number,
): number | false {
  return data?.pending && updateCount < PLAYER_VOICE_MAX_POLLS ? PLAYER_VOICE_POLL_MS : false;
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
