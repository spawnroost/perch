import { useState } from 'react';
import { flushSync } from 'react-dom';
import { Link, useNavigate } from 'react-router';
import type { DeviceView } from '@perch/core';
import { Button, HudChip, Notice, Skeleton } from '../atoms';
import { FeedbackActions, GameCard, Hero, LoadError, Shelf } from '../molecules';
import { useDevices, useFeedback, useRecommendations } from '@/hooks/queries';
import { useReduced } from '@/hooks/useMotionPrefs';
import { ALL_TAB, buildShelves, fitChips, FOR_YOU_LIMIT } from '@/lib/forYou';
import { coverLayoutId } from '@/lib/motion';

function LauncherSkeleton() {
  return (
    <div className="flex flex-col gap-8 pb-12" aria-busy>
      <Skeleton className="h-80 rounded-none" />
      <div className="flex gap-4 px-6">
        {[0, 1, 2, 3].map((i) => (
          <GameCard key={i} skeleton title="" />
        ))}
      </div>
    </div>
  );
}

function Launcher({ devices }: { devices: DeviceView[] }) {
  const feed = useRecommendations(ALL_TAB, FOR_YOU_LIMIT);
  const { feedback, send, error } = useFeedback();
  const navigate = useNavigate();
  const reduced = useReduced();
  // Only the clicked card carries the shared layoutId: the same game sits on several shelves.
  const [expanding, setExpanding] = useState<string | null>(null);

  if (feed.isPending) return <LauncherSkeleton />;
  if (feed.isError) {
    return (
      <div className="px-6">
        <LoadError message={feed.error.message} onRetry={() => void feed.refetch()} />
      </div>
    );
  }

  const top = feed.data[0];
  if (!top) {
    return (
      <div className="px-6">
        <Notice>
          {devices.length > 0 ? (
            'No picks yet. Add more games with hours played to sharpen them.'
          ) : (
            <>
              No picks yet.{' '}
              <Link to="/devices" className="text-fg underline underline-offset-4">
                Add a device
              </Link>{' '}
              to see what it can run.
            </>
          )}
        </Notice>
      </div>
    );
  }

  const open = (igdbId: number, key: string) => {
    flushSync(() => setExpanding(key));
    void navigate(`/games/${igdbId}`);
  };
  const shelves = buildShelves(feed.data, devices);

  return (
    <div className="flex flex-col gap-8 pb-12">
      <Hero
        title={top.game.name}
        heroUrl={top.game.heroUrl}
        accent={top.game.accent}
        meta={
          <>
            <p className="max-w-prose text-lg text-fg">{top.reason}</p>
            <ul aria-label="Will it run" className="flex flex-wrap gap-1.5">
              {fitChips(top.fits).map((chip) => (
                <li key={chip.label}>
                  <HudChip {...chip} />
                </li>
              ))}
            </ul>
          </>
        }
        actions={
          <>
            <Button
              variant="primary"
              onClick={() => open(top.game.igdbId, `hero:${top.game.igdbId}`)}
            >
              View details
            </Button>
            <FeedbackActions
              labels
              value={feedback[top.game.igdbId]}
              onSend={(kind) => send(top.game.igdbId, kind)}
            />
          </>
        }
      />
      {error && (
        <div className="px-6">
          <Notice tone="error">{error.message}</Notice>
        </div>
      )}
      <div className="flex flex-col gap-10 px-6">
        {shelves.map((shelf) => (
          <Shelf key={shelf.id} title={shelf.title} controls>
            {shelf.picks.map((r) => {
              const key = `${shelf.id}:${r.game.igdbId}`;
              return (
                <GameCard
                  key={r.game.igdbId}
                  title={r.game.name}
                  coverUrl={r.game.coverUrl}
                  coverUrlSmall={r.game.coverUrlSmall}
                  accent={r.game.accent}
                  chips={fitChips(r.fits)}
                  layoutId={expanding === key ? coverLayoutId(r.game.igdbId, reduced) : undefined}
                  onClick={() => open(r.game.igdbId, key)}
                />
              );
            })}
          </Shelf>
        ))}
      </div>
    </div>
  );
}

export function ForYou() {
  const devices = useDevices();
  if (devices.isPending) return <LauncherSkeleton />;
  if (devices.isError) {
    return (
      <div className="px-6">
        <LoadError message={devices.error.message} onRetry={() => void devices.refetch()} />
      </div>
    );
  }
  return <Launcher devices={devices.data} />;
}
