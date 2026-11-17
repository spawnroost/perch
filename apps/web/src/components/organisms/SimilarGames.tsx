import { Link } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { Notice, Skeleton } from '../atoms';
import { GameCard, LoadError } from '../molecules';
import { PickGrid } from './PickGrid';
import { useDevices, useFeedback, useSimilar } from '@/hooks/queries';
import { CARD_GRID } from '@/lib/cardWidth';
import { ALL_TAB } from '@/lib/forYou';

export type SimilarGamesProps = {
  igdbId: number;
  /** The device the switcher was on; anything not one of the user's devices means All. */
  device: string;
};

/** "More like <game>": games close to one game as a cover grid. */
export function SimilarGames({ igdbId, device }: SimilarGamesProps) {
  const devices = useDevices();
  // Only a device other than All has to wait for the device list (to check it still exists).
  const resolved = device === ALL_TAB || devices.isSuccess;
  const deviceId = devices.data?.some((d) => d.id === device) ? device : ALL_TAB;
  const similar = useSimilar(igdbId, deviceId, resolved);
  const { feedback, send, error } = useFeedback();
  const failure = devices.isError ? devices : similar.isError ? similar : null;
  const picks = similar.data?.recommendations;
  const name = similar.data?.game.name;

  return (
    <section className="flex w-full flex-col gap-6 px-gutter py-6">
      <div className="flex flex-col gap-2">
        <Link
          to={`/games/${igdbId}`}
          className="inline-flex w-fit items-center gap-1 rounded-sm text-sm text-fg-muted hover:text-fg"
        >
          <ArrowLeft size={14} strokeWidth={1.75} aria-hidden />
          {name ?? 'Back'}
        </Link>
        {name && picks ? (
          <>
            <h1 className="font-title text-3xl text-fg">More like {name}</h1>
            <p className="text-sm text-fg-muted tabular-nums">
              {picks.length} {picks.length === 1 ? 'game' : 'games'}
            </p>
          </>
        ) : (
          <h1 className="font-title text-3xl text-fg">
            {failure ? 'More like this' : <Skeleton className="h-9 w-64" />}
          </h1>
        )}
      </div>
      {error && <Notice tone="error">{error.message}</Notice>}
      {failure && (
        <LoadError message={failure.error.message} onRetry={() => void failure.refetch()} />
      )}
      {!failure && !picks && (
        <div aria-busy className={CARD_GRID}>
          {Array.from({ length: 12 }, (_, i) => (
            <GameCard key={i} skeleton title="" className="w-full" />
          ))}
        </div>
      )}
      {picks?.length === 0 && <Notice>Nothing similar to show right now.</Notice>}
      {devices.data && picks && picks.length > 0 && (
        <PickGrid
          picks={picks}
          devices={devices.data}
          deviceId={deviceId}
          feedback={feedback}
          onSend={send}
        />
      )}
    </section>
  );
}
