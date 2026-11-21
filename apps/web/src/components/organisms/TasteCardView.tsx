import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Download } from 'lucide-react';
import { Button, Notice, Skeleton } from '../atoms';
import { LoadError } from '../molecules';
import { TASTE_CARD_STEPS, TasteCard } from './TasteCard';
import { useTasteCard } from '@/hooks/queries';
import { useCardExport } from '@/hooks/useCardExport';
import { useReduced } from '@/hooks/useMotionPrefs';
import { revealSettleMs } from '@/lib/tasteCard';

/** The /me/card page: your taste card, and a button that saves it as a PNG. */
export function TasteCardView() {
  const card = useTasteCard();
  const reduced = useReduced();
  const ref = useRef<HTMLElement>(null);
  const exporter = useCardExport(ref, card.data?.playstyle?.label ?? null);
  const [settled, setSettled] = useState(false);

  // The PNG is taken after the reveal, so it never catches the card half-faded.
  const loaded = card.data !== undefined && !card.data.empty;
  useEffect(() => {
    setSettled(false);
    if (!loaded) return;
    const t = setTimeout(() => setSettled(true), revealSettleMs(TASTE_CARD_STEPS, reduced));
    return () => clearTimeout(t);
  }, [loaded, card.data, reduced]);

  if (card.isPending) return <Skeleton className="mx-auto aspect-3/4 w-full max-w-sm" />;
  if (card.isError || !card.data) {
    return (
      <LoadError message="Could not load your taste card." onRetry={() => void card.refetch()} />
    );
  }
  if (card.data.empty) {
    return (
      <div className="mx-auto flex max-w-sm flex-col items-start gap-3">
        <Notice tone="info">
          Add a few games to your library and your taste card appears here.
        </Notice>
        <Button asChild>
          <Link to="/library">Go to library</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col items-stretch gap-3">
      <TasteCard ref={ref} summary={card.data} />
      <Button
        variant="primary"
        loading={exporter.pending}
        disabled={!settled}
        onClick={() => void exporter.download()}
      >
        <Download size={16} aria-hidden />
        Download PNG
      </Button>
      {exporter.error && <Notice tone="error">{exporter.error}</Notice>}
      {exporter.withoutCovers && (
        <Notice tone="info">The cover images could not be included in this download.</Notice>
      )}
    </div>
  );
}
