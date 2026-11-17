import { Link, useNavigate, useNavigationType } from 'react-router';
import type { DeviceView } from '@perch/core';
import { Button, Notice, Skeleton } from '../atoms';
import { FeedbackActions, FitChips, GameCard, Hero, LoadError, Shelf } from '../molecules';
import {
  useDeviceRecommendations,
  useDevices,
  useFeedback,
  useRecommendations,
} from '@/hooks/queries';
import { useReduced } from '@/hooks/useMotionPrefs';
import {
  ALL_TAB,
  buildShelves,
  cardKey,
  FOR_YOU_LIMIT,
  layoutOwners,
  pickChips,
  capChips,
} from '@/lib/forYou';
import { hasDeckDevice } from '@/lib/devices';
import { coverLayoutId } from '@/lib/motion';

function LauncherSkeleton() {
  return (
    <div className="flex flex-col gap-8 pb-12" aria-busy>
      <Skeleton className="h-80 rounded-none" />
      <div className="flex gap-4 px-gutter">
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
  // Coming back from a detail page the cover would fly into a card clipped by the shelf scroller, so
  // the cards fade in instead of sharing the cover.
  const popped = useNavigationType() === 'POP';
  const deckDevice = hasDeckDevice(devices);
  const deviceFeeds = useDeviceRecommendations(
    devices.map((d) => d.id),
    FOR_YOU_LIMIT,
  );

  if (feed.isPending) return <LauncherSkeleton />;
  if (feed.isError) {
    return (
      <div className="px-gutter">
        <LoadError message={feed.error.message} onRetry={() => void feed.refetch()} />
      </div>
    );
  }

  const top = feed.data[0];
  if (!top) {
    return (
      <div className="px-gutter">
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

  const open = (igdbId: number) => void navigate(`/games/${igdbId}`);
  // A device shelf appears once its own feed has loaded; a failed or empty feed just has no shelf.
  const shelves = buildShelves(
    feed.data,
    devices.map((d, i) => ({ id: d.id, name: d.name, picks: deviceFeeds[i]?.data ?? [] })),
  );
  const owners = layoutOwners(shelves);

  return (
    <div className="flex flex-col gap-8 pb-12">
      <Hero
        title={top.game.name}
        titleAs="h2"
        heroUrl={top.game.heroUrl}
        accent={top.game.accent}
        meta={
          <>
            <p className="max-w-prose text-lg text-fg">{top.reason}</p>
            <FitChips fits={top.fits} />
          </>
        }
        actions={
          <>
            <Button variant="primary" onClick={() => open(top.game.igdbId)}>
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
        <div className="px-gutter">
          <Notice tone="error">{error.message}</Notice>
        </div>
      )}
      <div className="flex flex-col gap-10 px-gutter">
        {shelves.map((shelf) => (
          <Shelf key={shelf.id} title={shelf.title} controls>
            {shelf.picks.map((r) => {
              const id = r.game.igdbId;
              return (
                <GameCard
                  key={id}
                  title={r.game.name}
                  coverUrl={r.game.coverUrl}
                  coverUrlSmall={r.game.coverUrlSmall}
                  accent={r.game.accent}
                  chips={capChips(pickChips(r, { hasDeckDevice: deckDevice }))}
                  actions={
                    <FeedbackActions value={feedback[id]} onSend={(kind) => send(id, kind)} />
                  }
                  layoutId={
                    owners.has(cardKey(shelf.id, id))
                      ? coverLayoutId(id, reduced, popped)
                      : undefined
                  }
                  fadeIn={popped}
                  onClick={() => open(id)}
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
  return (
    <>
      <h1 className="sr-only">For you</h1>
      {devices.isPending ? (
        <LauncherSkeleton />
      ) : devices.isError ? (
        <div className="px-gutter">
          <LoadError message={devices.error.message} onRetry={() => void devices.refetch()} />
        </div>
      ) : (
        <Launcher devices={devices.data} />
      )}
    </>
  );
}
