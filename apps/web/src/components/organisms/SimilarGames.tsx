import { Notice } from '../atoms';
import { PickGrid } from './PickGrid';
import { PickGridPage } from './PickGridPage';
import { useFeedback, useSimilar } from '@/hooks/queries';
import { useResolvedDevice } from '@/hooks/useResolvedDevice';
import { ApiError } from '@/lib/api';

export type SimilarGamesProps = {
  igdbId: number;
  /** The device the switcher was on; anything not one of the user's devices means All. */
  device: string;
};

/** "More like <game>": games close to one game as a cover grid. */
export function SimilarGames({ igdbId, device }: SimilarGamesProps) {
  const { devices, resolved, deviceId } = useResolvedDevice(device);
  const similar = useSimilar(igdbId, deviceId, resolved);
  const { feedback, send, error } = useFeedback();
  const missing = similar.error instanceof ApiError && similar.error.status === 404;
  const failure = devices.isError ? devices : similar.isError ? similar : null;
  const picks = similar.data?.recommendations;
  const name = similar.data?.game.name;

  return (
    <PickGridPage
      back={{ to: `/games/${igdbId}`, label: name ?? 'Back' }}
      heading={name && picks ? { title: `More like ${name}`, count: picks.length } : null}
      fallbackTitle="More like this"
      failure={failure}
      notFound={missing && failure === similar ? 'We could not find that game.' : undefined}
      ready={picks !== undefined}
      actionError={error}
    >
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
    </PickGridPage>
  );
}
