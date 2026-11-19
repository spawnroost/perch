import { useMemo, useState } from 'react';
import { ListPlus, Pencil, Plus } from 'lucide-react';
import { Button, Notice, Sheet, SheetContent } from '../atoms';
import { GameCard, LibraryControls, LoadError } from '../molecules';
import { GameSearchAdd } from './GameSearchAdd';
import { ImportList } from './ImportList';
import { LibraryEntryEditor } from './LibraryEntryEditor';
import { useLibrary } from '@/hooks/queries';
import { useCardReturn } from '@/hooks/useCardReturn';
import {
  browseLibrary,
  entryChips,
  entryMeta,
  games,
  type LibraryFilter,
  type LibrarySort,
} from '@/lib/library';
import { CARD_GRID, CARD_GRID_SIZES } from '@/lib/cardWidth';
import { firstOfEach } from '@/lib/motion';

type Panel = { kind: 'add' } | { kind: 'import' } | { kind: 'edit'; id: string };

export function LibraryView() {
  const library = useLibrary();
  const cardReturn = useCardReturn();
  const [filter, setFilter] = useState<LibraryFilter>({ query: '', status: 'all' });
  const [sort, setSort] = useState<LibrarySort>('recent');
  const [panel, setPanel] = useState<Panel | null>(null);
  const close = () => setPanel(null);

  const editing = panel?.kind === 'edit' ? library.data?.find((e) => e.id === panel.id) : undefined;
  const { counts, shown } = useMemo(
    () => browseLibrary(library.data ?? [], { query: filter.query, status: filter.status }, sort),
    [library.data, filter.query, filter.status, sort],
  );
  // One game on two platforms is two entries; only the first may carry the shared-element id.
  const coverOwners = useMemo(() => firstOfEach(shown, (e) => e.igdbId), [shown]);

  return (
    <section className="flex w-full flex-col gap-6 px-gutter py-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-title text-3xl text-fg">Library</h1>
          {library.data && (
            <p className="text-sm text-fg-muted tabular-nums">{games(library.data.length)}</p>
          )}
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setPanel({ kind: 'import' })}>
            <ListPlus size={14} strokeWidth={1.75} aria-hidden />
            Import list
          </Button>
          <Button variant="primary" onClick={() => setPanel({ kind: 'add' })}>
            <Plus size={14} strokeWidth={1.75} aria-hidden />
            Add game
          </Button>
        </div>
      </div>

      {library.isPending && (
        <div aria-busy className={CARD_GRID}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <GameCard key={i} skeleton title="" className="w-full" />
          ))}
        </div>
      )}
      {library.isError && (
        <LoadError message={library.error.message} onRetry={() => void library.refetch()} />
      )}
      {library.data?.length === 0 && (
        <Notice>Your library is empty. Add a game or import a list to get picks.</Notice>
      )}
      {library.data && library.data.length > 0 && (
        <>
          <LibraryControls
            filter={filter}
            sort={sort}
            counts={counts}
            onFilter={setFilter}
            onSort={setSort}
          />
          {shown.length === 0 ? (
            <Notice>No games match this filter.</Notice>
          ) : (
            <ul className={CARD_GRID}>
              {shown.map((e) => (
                <li key={e.id}>
                  <GameCard
                    title={e.name}
                    coverUrl={e.coverUrl}
                    coverUrlSmall={e.coverUrlSmall}
                    accent={e.accent}
                    chips={entryChips(e)}
                    meta={entryMeta(e)}
                    glow={e.status === 'playing'}
                    sizes={CARD_GRID_SIZES}
                    layoutId={coverOwners.has(e) ? cardReturn.coverId(e.igdbId) : undefined}
                    fadeIn={cardReturn.fadeIn}
                    className="w-full"
                    to={`/games/${e.igdbId}`}
                    actions={
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Edit ${e.name}`}
                        onClick={() => setPanel({ kind: 'edit', id: e.id })}
                      >
                        <Pencil size={14} strokeWidth={1.75} aria-hidden />
                      </Button>
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <Sheet open={panel?.kind === 'add'} onOpenChange={(open) => !open && close()}>
        <SheetContent title="Add a game" description="Search and add it with optional hours.">
          <div className="no-scrollbar overflow-y-auto">
            <GameSearchAdd />
          </div>
        </SheetContent>
      </Sheet>
      <Sheet open={panel?.kind === 'import'} onOpenChange={(open) => !open && close()}>
        <SheetContent title="Import list" description="Paste a list of games, then review.">
          <ImportList onDone={close} />
        </SheetContent>
      </Sheet>
      <Sheet open={editing !== undefined} onOpenChange={(open) => !open && close()}>
        <SheetContent title={editing?.name ?? 'Edit game'} description="Edit your play history.">
          {editing && <LibraryEntryEditor key={editing.id} entry={editing} onDone={close} />}
        </SheetContent>
      </Sheet>
    </section>
  );
}
