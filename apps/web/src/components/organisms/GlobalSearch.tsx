import { useEffect, useId, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router';
import type { GameFitEntry } from '@perch/core';
import { Search, X } from 'lucide-react';
import {
  Input,
  Kbd,
  Notice,
  Sheet,
  SheetClose,
  SheetContent,
  SheetTrigger,
  Skeleton,
} from '../atoms';
import { SearchResultRow } from '../molecules';
import { useGameSearch, useSearchFits } from '@/hooks/queries';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { cn } from '@/lib/cn';
import {
  isSearchShortcut,
  modalDialogOpen,
  moveActive,
  optionId,
  visibleResults,
} from '@/lib/globalSearch';
import { releaseYear } from '@/lib/onboarding';

type Result = NonNullable<ReturnType<typeof useGameSearch>['data']>[number];

/** Global "can I play it?" search: a top-bar trigger, `/` and Ctrl/Cmd+K, opening a command palette. */
export function GlobalSearch() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e: globalThis.KeyboardEvent) {
      if (!isSearchShortcut(e) || modalDialogOpen(document)) return;
      e.preventDefault();
      setOpen(true);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label="Search games"
        aria-keyshortcuts="/ Control+K Meta+K"
        className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-md border border-line bg-surface-1 px-2.5 text-sm text-fg-subtle shadow-raised transition-colors duration-fast ease-out hover:text-fg sm:w-56"
      >
        <Search size={14} strokeWidth={1.75} aria-hidden />
        <span className="hidden flex-1 text-left sm:inline">Can I play...</span>
        <Kbd className="hidden sm:inline-flex" aria-hidden>
          /
        </Kbd>
      </SheetTrigger>
      <SheetContent
        side="palette"
        title="Search games"
        description="Search for a game to see whether it runs on each of your devices."
      >
        <SearchPanel onDone={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}

function SearchPanel({ onDone }: { onDone: () => void }) {
  const navigate = useNavigate();
  const uid = useId();
  const listId = `${uid}-list`;
  const optionPrefix = `${uid}-gs`;
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const q = useDebouncedValue(query.trim());
  const search = useGameSearch(q);
  const results = q.length >= 2 ? visibleResults(search.data) : undefined;
  const stale = search.isPlaceholderData;
  const rows = results ?? [];
  const fits = useSearchFits(
    rows.map((g) => g.igdbId),
    !stale,
  );
  const activeIndex = rows.length === 0 ? -1 : Math.min(active, rows.length - 1);
  const activeId = activeIndex >= 0 ? optionId(optionPrefix, rows[activeIndex]!.igdbId) : undefined;

  useEffect(() => {
    if (activeId) document.getElementById(activeId)?.scrollIntoView({ block: 'nearest' });
  }, [activeId]);

  function open(game: Result) {
    onDone();
    void navigate(`/games/${game.igdbId}`);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter') {
      const game = rows[activeIndex];
      if (game && !stale) {
        e.preventDefault();
        open(game);
      }
      return;
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
      // Home/End keep their caret meaning while the list is empty.
      if (rows.length === 0) return;
      e.preventDefault();
      setActive(moveActive(activeIndex, e.key, rows.length));
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-line p-3">
        <Input
          autoFocus
          role="combobox"
          aria-expanded={rows.length > 0}
          aria-controls={listId}
          aria-activedescendant={activeId}
          aria-autocomplete="list"
          aria-label="Search games"
          autoComplete="off"
          spellCheck={false}
          icon={<Search size={14} strokeWidth={1.75} />}
          placeholder="Search a game to see if it runs on your devices"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          className="flex-1"
        />
        <SheetClose
          aria-label="Close"
          className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-fg-muted transition-colors duration-fast ease-out hover:bg-surface-2 hover:text-fg"
        >
          <X size={16} strokeWidth={1.75} aria-hidden />
        </SheetClose>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <p role="status" className="sr-only">
          {results && !stale
            ? results.length === 0
              ? 'No games found'
              : `${results.length} games found`
            : ''}
        </p>
        {search.isError && <Notice tone="error">{search.error.message}</Notice>}
        {q.length >= 2 && !results && !search.isError && (
          <div aria-busy className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        )}
        {results && results.length === 0 && !stale && !search.isError && (
          <Notice>No games found for "{q}".</Notice>
        )}
        <ul
          id={listId}
          role="listbox"
          aria-label="Games"
          aria-busy={stale}
          className={cn('flex flex-col gap-1 transition-opacity', stale && 'opacity-50')}
          hidden={rows.length === 0}
        >
          {rows.map((g, i) => (
            <ResultOption
              key={g.igdbId}
              game={g}
              fit={fits.data?.[g.igdbId]}
              fitLoading={fits.isPending && !fits.isError}
              fitError={fits.isError}
              id={optionId(optionPrefix, g.igdbId)}
              active={i === activeIndex}
              onSelect={() => open(g)}
              onHover={() => setActive(i)}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}

function ResultOption({
  game,
  fit,
  fitLoading,
  fitError,
  id,
  active,
  onSelect,
  onHover,
}: {
  game: Result;
  fit: GameFitEntry | undefined;
  fitLoading: boolean;
  fitError: boolean;
  id: string;
  active: boolean;
  onSelect: () => void;
  onHover: () => void;
}) {
  return (
    <SearchResultRow
      id={id}
      name={game.name}
      year={releaseYear(game.firstRelease)}
      coverUrl={game.coverUrl}
      coverUrlSmall={game.coverUrlSmall}
      fits={fit?.fits}
      deck={fit?.deck}
      fitLoading={fitLoading}
      fitError={fitError}
      active={active}
      onSelect={onSelect}
      onHover={onHover}
    />
  );
}
