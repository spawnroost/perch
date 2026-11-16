import { useState } from 'react';
import { Search } from 'lucide-react';
import { Input, Notice, Skeleton } from '../atoms';
import { ConnectorsComingSoon, GameResultRow } from '../molecules';
import { useAddToLibrary, useGameSearch, useLibrary } from '@/hooks/queries';
import { cn } from '@/lib/cn';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { releaseYear } from '@/lib/onboarding';

export function GamesStep() {
  const [query, setQuery] = useState('');
  const q = useDebouncedValue(query.trim());
  const search = useGameSearch(q);
  const library = useLibrary();
  const add = useAddToLibrary();
  const [addingId, setAddingId] = useState<number | null>(null);

  const owned = new Set(library.data?.map((e) => e.igdbId));
  const results = q.length >= 2 ? search.data : undefined;

  function addGame(igdbId: number, hours: number | undefined) {
    setAddingId(igdbId);
    add.mutate({ igdbId, hoursPlayed: hours }, { onSettled: () => setAddingId(null) });
  }

  return (
    <div className="flex flex-col gap-4">
      <Input
        autoFocus
        icon={<Search size={14} strokeWidth={1.75} />}
        placeholder="Search games you have played"
        aria-label="Search games"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {add.error && <Notice tone="error">{add.error.message}</Notice>}
      {search.isError && <Notice tone="error">{search.error.message}</Notice>}
      {search.isFetching && !results && <Skeleton className="h-24" />}
      {results && results.length === 0 && <Notice>No games found for "{q}".</Notice>}
      {results && results.length > 0 && (
        <ul
          aria-busy={search.isPlaceholderData}
          className={cn(
            'overflow-hidden rounded-lg border border-line bg-surface-1 transition-opacity',
            search.isPlaceholderData && 'opacity-50',
          )}
        >
          {results.map((g) => (
            <GameResultRow
              key={g.igdbId}
              name={g.name}
              year={releaseYear(g.firstRelease)}
              added={owned.has(g.igdbId)}
              pending={addingId === g.igdbId}
              disabled={search.isPlaceholderData}
              onAdd={(hours) => addGame(g.igdbId, hours)}
            />
          ))}
        </ul>
      )}
      <p className="text-sm text-fg-muted tabular-nums">
        {library.data?.length ?? 0} in your library. Hours are optional; more playtime sharpens the
        picks.
      </p>
      <ConnectorsComingSoon />
    </div>
  );
}
