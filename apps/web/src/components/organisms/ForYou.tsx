import { Link, useNavigate, useSearchParams } from 'react-router';
import type { DeviceView } from '@perch/core';
import { Button, Notice, Skeleton } from '../atoms';
import {
  DeviceSwitcher,
  FeedbackActions,
  FitChips,
  GameCard,
  Hero,
  LoadError,
  SeeAllTile,
  Shelf,
} from '../molecules';
import { QuickSession } from './QuickSession';
import { useDevices, useFeedback, useForYouFeed } from '@/hooks/queries';
import { useCardReturn } from '@/hooks/useCardReturn';
import {
  ALL_TAB,
  buildShelves,
  cardKey,
  deviceOptions,
  cardChips,
  deviceSearch,
  layoutOwners,
  parseDevice,
  shelfPath,
} from '@/lib/forYou';

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
  const feed = useForYouFeed(ALL_TAB);
  const { feedback, send, error } = useFeedback();
  const navigate = useNavigate();
  const cardReturn = useCardReturn();
  const [params] = useSearchParams();
  const picked = parseDevice(params.get('device'));
  // A selection whose device was removed falls back to All.
  const selectedDevice = devices.find((d) => d.id === picked);
  const selected = selectedDevice ? picked : ALL_TAB;
  // The hero is the overall top pick; the shelves follow the selected device's own server-ranked feed.
  const shelfFeed = useForYouFeed(selected);
  // The selection lives in the URL so Back from a See all grid restores it.
  const select = (id: string) => void navigate({ search: deviceSearch(id) }, { replace: true });

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
  const shelves = shelfFeed.data ? buildShelves(shelfFeed.data, top.game.igdbId) : [];
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
        {devices.length > 0 && (
          <div className="flex items-center justify-between gap-3">
            <DeviceSwitcher
              label="Show picks for"
              options={deviceOptions(devices)}
              value={selected}
              onChange={select}
              className="min-w-0"
            />
            <QuickSession devices={devices} pickedId={selected} />
          </div>
        )}
        {shelfFeed.isError && (
          <LoadError message={shelfFeed.error.message} onRetry={() => void shelfFeed.refetch()} />
        )}
        {shelfFeed.isPending && (
          <div className="flex gap-4" aria-busy>
            {[0, 1, 2, 3].map((i) => (
              <GameCard key={i} skeleton title="" />
            ))}
          </div>
        )}
        {shelfFeed.isSuccess && !shelfFeed.isPlaceholderData && shelves.length === 0 && (
          <Notice>
            {selectedDevice ? `Nothing fits ${selectedDevice.name} yet.` : 'No more picks yet.'}
          </Notice>
        )}
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
                  chips={cardChips(r, devices, selected)}
                  actions={
                    <FeedbackActions value={feedback[id]} onSend={(kind) => send(id, kind)} />
                  }
                  layoutId={owners.has(cardKey(shelf.id, id)) ? cardReturn.coverId(id) : undefined}
                  fadeIn={cardReturn.fadeIn}
                  onClick={() => open(id)}
                />
              );
            })}
            {shelf.seeAll && <SeeAllTile label={shelf.title} to={shelfPath(shelf.id, selected)} />}
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
