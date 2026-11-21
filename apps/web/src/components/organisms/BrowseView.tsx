import { useSearchParams } from 'react-router';
import { Button, Notice, Skeleton } from '../atoms';
import { DeviceSwitcher, FacetChips, GameCard, LoadError } from '../molecules';
import { PickGrid } from './PickGrid';
import { useBrowse, useBrowseFacets, useFeedback } from '@/hooks/queries';
import { useResolvedDevice } from '@/hooks/useResolvedDevice';
import { useSlowHint } from '@/hooks/useSlowHint';
import { CARD_GRID } from '@/lib/cardWidth';
import {
  browseSearch,
  browseSelection,
  hasFilters,
  withToggled,
  type BrowseGroup,
} from '@/lib/browse';
import { deviceOptions } from '@/lib/forYou';

const CHIP_SKELETONS = 8;

/** Browse by category: genre and theme chips and a device switcher (all in the URL) over a cover grid. */
export function BrowseView() {
  const [params, setParams] = useSearchParams();
  const selection = browseSelection(params);
  const { devices, resolved, deviceId } = useResolvedDevice(selection.device);
  const facets = useBrowseFacets();
  const filtered = hasFilters(selection);
  const browse = useBrowse(selection.genres, selection.themes, deviceId, filtered && resolved);
  const { feedback, send, error } = useFeedback();
  const slow = useSlowHint(filtered && browse.isFetching);

  const update = (next: typeof selection) => setParams(browseSearch(next), { replace: true });
  const toggle = (group: BrowseGroup) => (id: number) => update(withToggled(selection, group, id));
  // With no chip on, the last selection's games (kept while the next load) must not linger.
  const picks = filtered ? browse.data : undefined;
  const failure = devices.isError
    ? devices
    : facets.isError
      ? facets
      : browse.isError
        ? browse
        : null;

  return (
    <section className="flex w-full flex-col gap-6 px-gutter py-6">
      <div>
        <h1 className="font-title text-3xl text-fg">Browse</h1>
        <p className="text-sm text-fg-muted">
          With both groups, a game must match one genre and one theme you picked.
        </p>
      </div>

      {devices.data && devices.data.length > 0 && (
        <DeviceSwitcher
          label="Show games for"
          options={deviceOptions(devices.data)}
          value={deviceId}
          onChange={(device) => update({ ...selection, device })}
        />
      )}

      {facets.data ? (
        <div className="flex flex-col gap-4">
          <FacetChips
            label="Genres"
            options={facets.data.genres}
            selected={selection.genres}
            onToggle={toggle('genres')}
          />
          <FacetChips
            label="Themes"
            options={facets.data.themes}
            selected={selection.themes}
            onToggle={toggle('themes')}
          />
        </div>
      ) : (
        !facets.isError && (
          <div aria-busy className="flex flex-wrap gap-2">
            {Array.from({ length: CHIP_SKELETONS }, (_, i) => (
              <Skeleton key={i} className="h-8 w-24" />
            ))}
          </div>
        )
      )}

      {error && <Notice tone="error">{error.message}</Notice>}
      {failure && (
        <LoadError message={failure.error.message} onRetry={() => void failure.refetch()} />
      )}
      {!filtered && !failure && (
        <Notice>Pick genres or themes to see matching games, ranked for your taste.</Notice>
      )}
      {slow && !failure && (
        <p role="status" className="text-sm text-fg-muted">
          Still loading…
        </p>
      )}
      {filtered && !failure && picks === undefined && (
        <div aria-busy className={CARD_GRID}>
          {Array.from({ length: 12 }, (_, i) => (
            <GameCard key={i} skeleton title="" className="w-full" />
          ))}
        </div>
      )}
      {filtered && picks?.length === 0 && <Notice>No games match. Try fewer filters.</Notice>}
      {devices.data && picks && picks.length > 0 && (
        <>
          <PickGrid
            picks={picks}
            devices={devices.data}
            deviceId={deviceId}
            feedback={feedback}
            onSend={send}
          />
          {browse.hasNextPage && (
            <div className="flex justify-center">
              <Button
                disabled={browse.isFetchingNextPage}
                onClick={() => void browse.fetchNextPage()}
              >
                {browse.isFetchingNextPage ? 'Loading…' : 'Load more'}
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
