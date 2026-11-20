/** Preview clips play quietly; they sit beside whatever else the user has going. */
export const PREVIEW_VOLUME = 0.6;

/** The slice of HTMLAudioElement the player uses (a fake in tests). */
export interface AudioLike {
  src: string;
  volume: number;
  play(): Promise<void>;
  pause(): void;
  addEventListener(type: 'ended' | 'error', fn: () => void): void;
  removeEventListener(type: 'ended' | 'error', fn: () => void): void;
}

export interface PreviewPlayer {
  /** Plays `url`, replacing any other preview; pauses when `url` is the one playing. */
  toggle(url: string): void;
  stop(): void;
  subscribe(fn: () => void): () => void;
  /** The url playing now, or null. */
  getSnapshot(): string | null;
}

/** One lazily created audio element shared by every preview button, so only one plays at a time. */
export function createPreviewPlayer(makeAudio: () => AudioLike): PreviewPlayer {
  let audio: AudioLike | null = null;
  let playing: string | null = null;
  const listeners = new Set<() => void>();

  function set(url: string | null) {
    if (playing === url) return;
    playing = url;
    listeners.forEach((fn) => fn());
  }

  function element(): AudioLike {
    if (audio) return audio;
    audio = makeAudio();
    audio.volume = PREVIEW_VOLUME;
    audio.addEventListener('ended', () => set(null));
    audio.addEventListener('error', () => set(null));
    return audio;
  }

  return {
    toggle(url) {
      const a = element();
      if (playing === url) {
        a.pause();
        set(null);
        return;
      }
      a.src = url;
      a.play().catch(() => {
        if (playing === url) set(null);
      });
      set(url);
    },
    stop() {
      audio?.pause();
      set(null);
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    getSnapshot: () => playing,
  };
}

let shared: PreviewPlayer | undefined;
/** The page-wide player; browser only (it builds an Audio element on first use). */
export function getPreviewPlayer(): PreviewPlayer {
  return (shared ??= createPreviewPlayer(() => new Audio()));
}
