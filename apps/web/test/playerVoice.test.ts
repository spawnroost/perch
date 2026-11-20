import { describe, expect, it } from 'vitest';
import {
  PLAYER_VOICE_MAX_POLLS,
  PLAYER_VOICE_POLL_MS,
  playerVoicePollMs,
  voiceGroups,
} from '../src/lib/playerVoice.js';

describe('playerVoicePollMs', () => {
  it('polls every 2 s while pending, at most 5 times', () => {
    expect(playerVoicePollMs({ pending: true }, 1)).toBe(PLAYER_VOICE_POLL_MS);
    expect(playerVoicePollMs({ pending: true }, PLAYER_VOICE_MAX_POLLS - 1)).toBe(2000);
    expect(playerVoicePollMs({ pending: true }, PLAYER_VOICE_MAX_POLLS)).toBe(false);
  });
  it('does not poll once settled or before data', () => {
    expect(playerVoicePollMs({}, 1)).toBe(false);
    expect(playerVoicePollMs({ pending: false }, 1)).toBe(false);
    expect(playerVoicePollMs(undefined, 0)).toBe(false);
  });
});

describe('voiceGroups', () => {
  it('lists likes then complaints and drops empty groups', () => {
    const g = voiceGroups({ likes: ['a'], complaints: ['b', 'c'], deck: null });
    expect(g.map((x) => [x.kind, x.items])).toEqual([
      ['likes', ['a']],
      ['complaints', ['b', 'c']],
    ]);
    expect(voiceGroups({ likes: [], complaints: ['b'], deck: null }).map((x) => x.kind)).toEqual([
      'complaints',
    ]);
  });
});
