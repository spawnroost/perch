import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Timer } from 'lucide-react';
import type { DeviceView } from '@perch/core';
import { Button, Notice, SectionHeading, Sheet, SheetContent, SheetTrigger } from '../atoms';
import { DeviceSwitcher, GameCard, LoadError } from '../molecules';
import { useSession } from '@/hooks/queries';
import { CARD_GRID, CARD_GRID_SIZES } from '@/lib/cardWidth';
import {
  capSession,
  DEFAULT_SESSION_MINUTES,
  SESSION_MINUTES,
  SESSION_RESULT_CAP,
  sessionDevice,
  sessionParams,
  sessionTitle,
} from '@/lib/session';

const MINUTE_OPTIONS = SESSION_MINUTES.map((m) => ({ id: String(m), label: `${m} min` }));

function SessionResults({ device, minutes }: { device: DeviceView; minutes: number }) {
  const navigate = useNavigate();
  const session = useSession(sessionParams({ minutes, device }));

  if (session.isError) {
    return <LoadError message={session.error.message} onRetry={() => void session.refetch()} />;
  }
  if (session.isPending) {
    return (
      <div className={CARD_GRID} aria-busy>
        {Array.from({ length: SESSION_RESULT_CAP }, (_, i) => (
          <GameCard key={i} skeleton title="" className="w-full" />
        ))}
      </div>
    );
  }
  const picks = capSession(session.data.recommendations);
  if (picks.length === 0) {
    return <Notice>Nothing fits that session on {device.name} yet. Try more time.</Notice>;
  }
  return (
    <section aria-busy={session.isPlaceholderData} className="flex flex-col gap-3">
      <SectionHeading>{sessionTitle(session.data.query, device.name)}</SectionHeading>
      <ul className={CARD_GRID}>
        {picks.map((r) => {
          const id = r.game.igdbId;
          return (
            <li key={id}>
              <GameCard
                title={r.game.name}
                coverUrl={r.game.coverUrl}
                coverUrlSmall={r.game.coverUrlSmall}
                accent={r.game.accent}
                sizes={CARD_GRID_SIZES}
                className="w-full"
                chips={
                  r.sessionReason
                    ? [{ label: r.sessionReason, tone: 'yes' as const, plain: true as const }]
                    : undefined
                }
                onClick={() => void navigate(`/games/${id}`)}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** "Quick session" button and sheet: pick a device, then picks ranked for the time available. */
export function QuickSession({ devices }: { devices: readonly DeviceView[] }) {
  // Lives here, not in the sheet, so the pick survives closing and reopening it.
  const [pickedId, setPickedId] = useState<string | undefined>(undefined);
  const [minutes, setMinutes] = useState(DEFAULT_SESSION_MINUTES);
  const device = sessionDevice(devices, pickedId);
  if (devices.length === 0) return null;
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
        <div className="no-scrollbar flex min-h-0 flex-col gap-5 overflow-y-auto">
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-medium text-fg">Where are you playing?</p>
            <DeviceSwitcher
              label="Where are you playing?"
              options={devices.map((d) => ({ id: d.id, label: d.name }))}
              value={device?.id ?? ''}
              onChange={setPickedId}
              className="flex-wrap"
            />
          </div>
          {device ? (
            <>
              <DeviceSwitcher
                label="Time available"
                options={MINUTE_OPTIONS}
                value={String(minutes)}
                onChange={(id) => setMinutes(Number(id))}
                className="flex-wrap"
              />
              <SessionResults key={device.id} device={device} minutes={minutes} />
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
