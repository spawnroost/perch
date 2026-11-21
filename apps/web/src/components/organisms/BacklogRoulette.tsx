import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Dices } from 'lucide-react';
import { Button, Notice, Sheet, SheetClose, SheetContent, SheetTrigger } from '../atoms';
import { CardShuffle, DeviceSwitcher, LoadError, RoulettePick } from '../molecules';
import { useDevices, useSetGameStatus } from '@/hooks/queries';
import { useRoulette } from '@/hooks/useRoulette';
import { deviceOptions } from '@/lib/forYou';
import { ANY, MOOD_OPTIONS, relaxedNote } from '@/lib/roulette';
import { SESSION_MINUTES } from '@/lib/session';
import type { Mood } from '@perch/core/browser';

const MINUTE_OPTIONS = [
  { id: ANY, label: 'Any time' },
  ...SESSION_MINUTES.map((m) => ({ id: String(m), label: `${m} min` })),
];

function RouletteBody({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const devices = useDevices().data ?? [];
  const setStatus = useSetGameStatus();
  const { filters, choose, respin, shuffling, slow, result, error } = useRoulette();
  const [playError, setPlayError] = useState<string | null>(null);
  const pick = shuffling ? null : (result?.pick ?? null);

  const play = async () => {
    if (!pick) return;
    setPlayError(null);
    try {
      await setStatus.mutateAsync({ igdbId: pick.game.igdbId, status: 'playing' });
    } catch (err) {
      setPlayError(err instanceof Error ? err.message : 'Could not mark it as playing.');
      return;
    }
    onClose();
    void navigate(`/games/${pick.game.igdbId}`);
  };

  const status = shuffling
    ? 'Shuffling your backlog'
    : pick
      ? `Picked ${pick.game.name}`
      : 'Nothing to pick';
  const note = pick ? relaxedNote(result?.relaxed ?? null, filters.mood) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="no-scrollbar flex flex-col gap-1">
        {devices.length > 1 && (
          <DeviceSwitcher
            label="Device"
            options={deviceOptions(devices)}
            value={filters.device}
            onChange={(device) => choose({ device })}
          />
        )}
        <DeviceSwitcher
          label="Time available"
          options={MINUTE_OPTIONS}
          value={filters.minutes === null ? ANY : String(filters.minutes)}
          onChange={(id) => choose({ minutes: id === ANY ? null : Number(id) })}
        />
        <DeviceSwitcher
          label="Mood"
          options={MOOD_OPTIONS}
          value={filters.mood ?? ANY}
          onChange={(id) => choose({ mood: id === ANY ? null : (id as Mood) })}
        />
      </div>

      <div className="flex min-h-80 flex-col items-center justify-center gap-3 py-2">
        <p className="sr-only" role="status" aria-live="polite">
          {status}
        </p>
        {error ? (
          <LoadError message={error.message} onRetry={respin} />
        ) : shuffling ? (
          <CardShuffle />
        ) : pick ? (
          <RoulettePick key={pick.game.igdbId + ':' + String(result?.relaxed)} pick={pick} />
        ) : (
          <Notice>
            Nothing in your backlog fits{filters.device === 'all' ? '' : ' that device'}. Add games
            you own but have not started, or try a different device.
          </Notice>
        )}
        {slow && !error && <p className="text-xs text-fg-muted">Still shuffling…</p>}
        {note && <p className="text-xs text-fg-muted">{note}</p>}
        {playError && <Notice tone="error">{playError}</Notice>}
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <SheetClose asChild>
          <Button variant="ghost">Not tonight</Button>
        </SheetClose>
        <Button onClick={respin} disabled={shuffling}>
          <Dices size={14} strokeWidth={1.75} aria-hidden />
          Spin again
        </Button>
        <Button
          variant="primary"
          onClick={() => void play()}
          disabled={!pick}
          loading={setStatus.isPending}
        >
          Play
        </Button>
      </div>
    </div>
  );
}

/** "Spin" button and dialog: picks one backlog game to play, optionally by device, time and mood. */
export function BacklogRoulette() {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button className="shrink-0">
          <Dices size={16} strokeWidth={1.75} aria-hidden />
          Spin
        </Button>
      </SheetTrigger>
      <SheetContent
        side="center"
        title="Backlog roulette"
        description="Cannot decide? Let your backlog pick."
      >
        <RouletteBody onClose={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
