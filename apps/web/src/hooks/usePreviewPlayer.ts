import { useEffect, useSyncExternalStore } from 'react';
import { getPreviewPlayer } from '@/lib/previewPlayer';

/** Which preview url is playing, plus toggle/stop. Playback stops when the component unmounts (route change). */
export function usePreviewPlayer() {
  const player = getPreviewPlayer();
  const playingUrl = useSyncExternalStore(player.subscribe, player.getSnapshot, () => null);
  useEffect(() => () => player.stop(), [player]);
  return { playingUrl, toggle: player.toggle, stop: player.stop };
}
