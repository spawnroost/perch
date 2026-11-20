import { Pause, Play } from 'lucide-react';
import { EqualizerBars } from '../atoms';
import { cn } from '@/lib/cn';

export interface TrackRowProps {
  number: number;
  name: string;
  /** "m:ss", empty when unknown. */
  time: string;
  /** Whether a clip exists; without one the row is just text. */
  playable: boolean;
  playing: boolean;
  onToggle: () => void;
}

/** One soundtrack track: a play/pause button for its 30 s clip, the title and its length. */
export function TrackRow({ number, name, time, playable, playing, onToggle }: TrackRowProps) {
  return (
    <li
      className={cn(
        'flex items-center gap-2 rounded-md px-1.5 py-1 text-sm transition-colors duration-fast ease-out',
        playing ? 'bg-surface-2 text-fg' : 'text-fg-muted',
      )}
    >
      {playable ? (
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={playing}
          aria-label={`${playing ? 'Pause' : 'Play'} preview of ${name}`}
          className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full bg-surface-3 text-fg transition-colors duration-fast ease-out hover:bg-surface-4"
        >
          {playing ? (
            <Pause size={12} strokeWidth={1.75} aria-hidden />
          ) : (
            <Play size={12} strokeWidth={1.75} aria-hidden />
          )}
        </button>
      ) : (
        <span className="flex size-7 shrink-0 items-center justify-center text-2xs text-fg-subtle tabular-nums">
          {number}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate">{name}</span>
      {playing ? <EqualizerBars /> : null}
      <span className="text-xs text-fg-subtle tabular-nums">{time}</span>
    </li>
  );
}
