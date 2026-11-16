import { ConnectorsComingSoon } from '../molecules';
import { GameSearchAdd } from './GameSearchAdd';
import { useLibrary } from '@/hooks/queries';

export function GamesStep() {
  const library = useLibrary();
  return (
    <div className="flex flex-col gap-4">
      <GameSearchAdd />
      <p className="text-sm text-fg-muted tabular-nums">
        {library.data?.length ?? 0} in your library. Hours are optional; more playtime sharpens the
        picks.
      </p>
      <ConnectorsComingSoon />
    </div>
  );
}
