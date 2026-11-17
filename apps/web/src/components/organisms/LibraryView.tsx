import { useState } from 'react';
import { ListPlus, Plus } from 'lucide-react';
import { Button, Notice, Sheet, SheetContent, Skeleton } from '../atoms';
import { LibraryControls, LibraryRow, LoadError } from '../molecules';
import { GameSearchAdd } from './GameSearchAdd';
import { ImportList } from './ImportList';
import { LibraryEntryEditor } from './LibraryEntryEditor';
import { useLibrary } from '@/hooks/queries';
import {
  filterLibrary,
  games,
  sortLibrary,
  type LibraryFilter,
  type LibrarySort,
} from '@/lib/library';

type Panel = { kind: 'add' } | { kind: 'import' } | { kind: 'edit'; id: string };

export function LibraryView() {
  const library = useLibrary();
  const [filter, setFilter] = useState<LibraryFilter>({ query: '', status: 'all' });
  const [sort, setSort] = useState<LibrarySort>('recent');
  const [panel, setPanel] = useState<Panel | null>(null);
  const close = () => setPanel(null);

  const editing = panel?.kind === 'edit' ? library.data?.find((e) => e.id === panel.id) : undefined;
  const shown = library.data ? sortLibrary(filterLibrary(library.data, filter), sort) : [];

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-display text-fg">Library</h1>
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

      {library.isPending && <Skeleton className="h-40" />}
      {library.isError && (
        <LoadError message={library.error.message} onRetry={() => void library.refetch()} />
      )}
      {library.data?.length === 0 && (
        <Notice>Your library is empty. Add a game or import a list to get picks.</Notice>
      )}
      {library.data && library.data.length > 0 && (
        <>
          <LibraryControls filter={filter} sort={sort} onFilter={setFilter} onSort={setSort} />
          {shown.length === 0 ? (
            <Notice>No games match this filter.</Notice>
          ) : (
            <ul className="overflow-hidden rounded-lg border border-line bg-surface-1">
              {shown.map((e) => (
                <LibraryRow
                  key={e.id}
                  entry={e}
                  onEdit={() => setPanel({ kind: 'edit', id: e.id })}
                />
              ))}
            </ul>
          )}
        </>
      )}

      <Sheet open={panel?.kind === 'add'} onOpenChange={(open) => !open && close()}>
        <SheetContent title="Add a game" description="Search and add it with optional hours.">
          <div className="overflow-y-auto">
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
