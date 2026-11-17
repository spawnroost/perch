import { Link } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { Notice, Skeleton } from '../atoms';
import { FeedbackActions, GameCard, LoadError } from '../molecules';
import { useDevices, useFeedback, useRecommendations } from '@/hooks/queries';
import { useCardReturn } from '@/hooks/useCardReturn';
import { CARD_GRID, CARD_GRID_SIZES } from '@/lib/cardWidth';
import { ALL_TAB, cardChips, deviceSearch, FOR_YOU_LIMIT, shelfPicks } from '@/lib/forYou';

export type ForYouShelfProps = {
  /** A key from parseShelfKey. */
  shelfKey: string;
  /** The device the switcher was on; anything not one of the user's devices means All. */
  device: string;
};

/** Every pick on one For you shelf as a cover grid: the launcher's feeds and hero exclusion, minus the card cap. */
export function ForYouShelf({ shelfKey, device }: ForYouShelfProps) {
  const devices = useDevices();
  // Only a device other than All has to wait for the device list (to check it still exists).
  const resolved = device === ALL_TAB || devices.isSuccess;
  const deviceId = devices.data?.some((d) => d.id === device) ? device : ALL_TAB;
  const hero = useRecommendations(ALL_TAB, FOR_YOU_LIMIT);
  const feed = useRecommendations(deviceId, FOR_YOU_LIMIT, false, resolved);
  const { feedback, send, error } = useFeedback();
  const cardReturn = useCardReturn();
  const ready = resolved && hero.isSuccess && feed.isSuccess;
  const heroId = hero.data?.[0]?.game.igdbId ?? null;
  const shelf = ready ? shelfPicks(feed.data, shelfKey, heroId) : null;
  const failure = devices.isError ? devices : hero.isError ? hero : feed.isError ? feed : null;

  return (
    <section className="flex w-full flex-col gap-6 px-gutter py-6">
      <div className="flex flex-col gap-2">
        <Link
          to={`/${deviceSearch(device)}`}
          className="inline-flex w-fit items-center gap-1 rounded-sm text-sm text-fg-muted hover:text-fg"
        >
          <ArrowLeft size={14} strokeWidth={1.75} aria-hidden />
          For you
        </Link>
        {shelf ? (
          <>
            <h1 className="font-title text-3xl text-fg">{shelf.title}</h1>
            <p className="text-sm text-fg-muted tabular-nums">
              {shelf.picks.length} {shelf.picks.length === 1 ? 'game' : 'games'}
            </p>
          </>
        ) : (
          <h1 className="font-title text-3xl text-fg">
            {failure || ready ? 'For you' : <Skeleton className="h-9 w-64" />}
          </h1>
        )}
      </div>
      {error && <Notice tone="error">{error.message}</Notice>}
      {failure && (
        <LoadError message={failure.error.message} onRetry={() => void failure.refetch()} />
      )}
      {!failure && !ready && (
        <div aria-busy className={CARD_GRID}>
          {Array.from({ length: 12 }, (_, i) => (
            <GameCard key={i} skeleton title="" className="w-full" />
          ))}
        </div>
      )}
      {ready && !shelf && <Notice>Nothing on this shelf right now.</Notice>}
      {devices.data && shelf && (
        <ul className={CARD_GRID}>
          {shelf.picks.map((r) => {
            const id = r.game.igdbId;
            return (
              <li key={id}>
                <GameCard
                  title={r.game.name}
                  coverUrl={r.game.coverUrl}
                  coverUrlSmall={r.game.coverUrlSmall}
                  accent={r.game.accent}
                  chips={cardChips(r, devices.data, deviceId)}
                  sizes={CARD_GRID_SIZES}
                  layoutId={cardReturn.coverId(id)}
                  fadeIn={cardReturn.fadeIn}
                  className="w-full"
                  to={`/games/${id}`}
                  actions={
                    <FeedbackActions value={feedback[id]} onSend={(kind) => send(id, kind)} />
                  }
                />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
