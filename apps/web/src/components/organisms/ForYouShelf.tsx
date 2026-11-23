import { Notice } from '../atoms';
import { PickGrid } from './PickGrid';
import { PickGridPage } from './PickGridPage';
import { useFeedback, useRecommendations } from '@/hooks/queries';
import { useResolvedDevice } from '@/hooks/useResolvedDevice';
import { mobileDeviceIds } from '@/lib/devices';
import { ALL_TAB, deviceSearch, FOR_YOU_LIMIT, shelfPicks } from '@/lib/forYou';

export type ForYouShelfProps = {
  /** A key from parseShelfKey. */
  shelfKey: string;
  /** The device the switcher was on; anything not one of the user's devices means All. */
  device: string;
};

/** Every pick on one For you shelf as a cover grid: the launcher's feeds and hero exclusion, minus the card cap. */
export function ForYouShelf({ shelfKey, device }: ForYouShelfProps) {
  const { devices, resolved, deviceId } = useResolvedDevice(device);
  const hero = useRecommendations(ALL_TAB, FOR_YOU_LIMIT);
  const feed = useRecommendations(deviceId, FOR_YOU_LIMIT, false, resolved);
  const { feedback, send, error } = useFeedback();
  const ready = resolved && hero.isSuccess && feed.isSuccess;
  const heroId = hero.data?.[0]?.game.igdbId ?? null;
  const shelf = ready
    ? shelfPicks(feed.data, shelfKey, heroId, mobileDeviceIds(devices.data ?? []))
    : null;
  const failure = devices.isError ? devices : hero.isError ? hero : feed.isError ? feed : null;

  return (
    <PickGridPage
      back={{ to: `/${deviceSearch(device)}`, label: 'For you' }}
      heading={shelf ? { title: shelf.title, count: shelf.picks.length } : null}
      fallbackTitle="For you"
      failure={failure}
      ready={ready}
      actionError={error}
    >
      {ready && !shelf && <Notice>Nothing on this shelf right now.</Notice>}
      {devices.data && shelf && (
        <PickGrid
          picks={shelf.picks}
          devices={devices.data}
          deviceId={deviceId}
          feedback={feedback}
          onSend={send}
        />
      )}
    </PickGridPage>
  );
}
