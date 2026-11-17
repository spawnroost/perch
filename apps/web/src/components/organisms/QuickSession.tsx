import { useEffect, useId, useState } from 'react';
import { useNavigate } from 'react-router';
import { Timer } from 'lucide-react';
import type { DeviceView } from '@perch/core';
import { Button, Label, Notice, Sheet, SheetContent, SheetTrigger } from '../atoms';
import { DeviceSwitcher, GameCard, LoadError, Shelf } from '../molecules';
import { useSession } from '@/hooks/queries';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { ALL_TAB, capChips, pickChips } from '@/lib/forYou';
import {
  DEFAULT_SESSION_MINUTES,
  readBatteryPercent,
  SESSION_MINUTES,
  sessionDevice,
  sessionParams,
  showBattery,
} from '@/lib/session';

const MINUTE_OPTIONS = SESSION_MINUTES.map((m) => ({ id: String(m), label: `${m} min` }));
const BATTERY_DEBOUNCE_MS = 300;

function SessionBody({ device, usingDefault }: { device: DeviceView; usingDefault: boolean }) {
  const navigate = useNavigate();
  const batteryId = useId();
  const handheld = showBattery(device);
  const [minutes, setMinutes] = useState(DEFAULT_SESSION_MINUTES);
  const [battery, setBattery] = useState<number | undefined>(undefined);
  const [batteryRead, setBatteryRead] = useState(false);

  // Prefill the slider from the Battery API (an external system); a value the user set wins.
  useEffect(() => {
    if (!handheld) return;
    let live = true;
    void readBatteryPercent(navigator).then((level) => {
      if (!live) return;
      setBattery((current) => current ?? level);
      setBatteryRead(true);
    });
    return () => {
      live = false;
    };
  }, [handheld]);

  const debouncedBattery = useDebouncedValue(battery, BATTERY_DEBOUNCE_MS);
  // Wait for the battery read so a handheld does not fetch twice.
  const ready = !handheld || batteryRead;
  const session = useSession(
    ready ? sessionParams({ minutes, battery: debouncedBattery, device }) : null,
  );

  return (
    <div className="flex min-h-0 flex-col gap-5 overflow-y-auto">
      <p className="text-sm text-fg-muted">
        Playing on <span className="font-medium text-fg">{device.name}</span>
        {usingDefault ? ' (your default device)' : null}
      </p>
      <DeviceSwitcher
        label="Time available"
        options={MINUTE_OPTIONS}
        value={String(minutes)}
        onChange={(id) => setMinutes(Number(id))}
      />
      {handheld ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={batteryId}>Battery left: {battery ?? 100}%</Label>
          <input
            id={batteryId}
            type="range"
            min={0}
            max={100}
            step={5}
            value={battery ?? 100}
            onChange={(e) => setBattery(Number(e.currentTarget.value))}
            aria-valuetext={`${battery ?? 100} percent`}
            className="w-full cursor-pointer accent-accent"
          />
        </div>
      ) : null}
      {session.isError ? (
        <LoadError message={session.error.message} onRetry={() => void session.refetch()} />
      ) : session.isPending ? (
        <div className="flex gap-4" aria-busy>
          {[0, 1, 2, 3].map((i) => (
            <GameCard key={i} skeleton title="" />
          ))}
        </div>
      ) : session.data.length === 0 ? (
        <Notice>Nothing fits that session on {device.name} yet. Try more time.</Notice>
      ) : (
        <div aria-busy={session.isPlaceholderData}>
          <Shelf title={`Fits ${minutes} min on ${device.name}`} controls>
            {session.data.map((r) => {
              const id = r.game.igdbId;
              return (
                <GameCard
                  key={id}
                  title={r.game.name}
                  coverUrl={r.game.coverUrl}
                  coverUrlSmall={r.game.coverUrlSmall}
                  accent={r.game.accent}
                  chips={capChips([
                    ...(r.sessionReason
                      ? [{ label: r.sessionReason, tone: 'yes' as const, plain: true as const }]
                      : []),
                    ...pickChips(r, {
                      omitDeviceId: device.id,
                      hasDeckDevice: device.kind === 'steam-deck',
                    }),
                  ])}
                  onClick={() => void navigate(`/games/${id}`)}
                />
              );
            })}
          </Shelf>
        </div>
      )}
    </div>
  );
}

/** "Quick session" button and sheet: picks ranked for the time (and battery) the player has. */
export function QuickSession({
  devices,
  pickedId,
}: {
  devices: readonly DeviceView[];
  /** The For you device switcher's current selection. */
  pickedId: string;
}) {
  const device = sessionDevice(devices, pickedId);
  if (!device) return null;
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button className="shrink-0">
          <Timer size={16} strokeWidth={1.75} aria-hidden />
          Quick session
        </Button>
      </SheetTrigger>
      <SheetContent
        side="bottom"
        title="Quick session"
        description="Games that fit the time you have."
      >
        <SessionBody key={device.id} device={device} usingDefault={pickedId === ALL_TAB} />
      </SheetContent>
    </Sheet>
  );
}
