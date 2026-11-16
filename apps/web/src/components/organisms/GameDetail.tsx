import { Link } from 'react-router';
import { Check, ChevronLeft, Plus } from 'lucide-react';
import { Badge, Button, Cover, DeckBadge, Notice, Skeleton } from '../atoms';
import { FeedbackActions, FitDetailRow, LoadError } from '../molecules';
import {
  useAddToLibrary,
  useFeedbackState,
  useGameDetail,
  useLibrary,
  useSendFeedback,
} from '@/hooks/queries';
import { ApiError } from '@/lib/api';
import { releaseYear } from '@/lib/onboarding';
import { platformNames } from '@/lib/platforms';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-fg-muted">{title}</h2>
      {children}
    </section>
  );
}

export function GameDetail({ igdbId }: { igdbId: number | null }) {
  const detail = useGameDetail(igdbId);
  const library = useLibrary();
  const add = useAddToLibrary();
  const feedback = useFeedbackState().data;
  const send = useSendFeedback();

  const back = (
    <Link
      to="/"
      className="inline-flex w-fit items-center gap-1 rounded-sm text-sm text-fg-muted hover:text-fg"
    >
      <ChevronLeft size={14} strokeWidth={1.75} aria-hidden />
      For you
    </Link>
  );

  if (igdbId === null) return <NotFound back={back} />;
  if (detail.isPending) {
    return (
      <>
        {back}
        <div className="flex gap-4" aria-busy>
          <Skeleton className="aspect-3/4 w-32 shrink-0" />
          <Skeleton className="h-32 flex-1" />
        </div>
      </>
    );
  }
  if (detail.isError) {
    if (detail.error instanceof ApiError && detail.error.status === 404) {
      return <NotFound back={back} />;
    }
    return (
      <>
        {back}
        <LoadError message={detail.error.message} onRetry={() => void detail.refetch()} />
      </>
    );
  }

  const { game, fit, deck, why } = detail.data;
  const year = releaseYear(game.firstRelease);
  const platforms = platformNames(game.platforms);
  const inLibrary = library.data?.some((e) => e.igdbId === game.igdbId) ?? false;

  return (
    <>
      {back}
      <header className="flex gap-4">
        <Cover src={game.coverUrl} alt={`${game.name} cover`} className="w-32 shrink-0" />
        <div className="flex min-w-0 flex-col items-start gap-2">
          <h1 className="text-2xl font-semibold tracking-display text-fg">{game.name}</h1>
          <p className="text-sm text-fg-muted tabular-nums">
            {[year, game.rating !== null && `Rated ${Math.round(game.rating)}`]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {deck && <DeckBadge category={deck} />}
            {platforms.map((p) => (
              <Badge key={p}>{p}</Badge>
            ))}
          </div>
          <div className="mt-auto flex flex-wrap items-center gap-3">
            {inLibrary ? (
              <span className="flex items-center gap-1.5 text-sm text-fit-yes">
                <Check size={14} strokeWidth={1.75} aria-hidden />
                In library
              </span>
            ) : (
              <Button
                variant="primary"
                loading={add.isPending}
                disabled={library.isPending}
                onClick={() => add.mutate({ igdbId: game.igdbId })}
              >
                <Plus size={14} strokeWidth={1.75} aria-hidden />
                Add to library
              </Button>
            )}
            <FeedbackActions
              labels
              value={feedback[game.igdbId]}
              onSend={(kind) => send.mutate({ igdbId: game.igdbId, kind })}
            />
          </div>
        </div>
      </header>
      {add.isError && <Notice tone="error">{add.error.message}</Notice>}
      {send.isError && <Notice tone="error">{send.error.message}</Notice>}

      <Section title="Why it's recommended">
        {why.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {why.map((line) => (
              <li key={line} className="text-base text-fg">
                {line}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-base text-fg-muted">
            Nothing in your library points to this game yet. Add more games with hours played.
          </p>
        )}
      </Section>

      <Section title="Will it run">
        {fit.length > 0 ? (
          <ul className="overflow-hidden rounded-lg border border-line bg-surface-1">
            {fit.map((f) => (
              <FitDetailRow key={f.deviceId} deviceName={f.deviceName} status={f.status} />
            ))}
          </ul>
        ) : (
          <Notice>
            <Link to="/devices" className="text-fg underline underline-offset-4">
              Add a device
            </Link>{' '}
            to see whether it runs.
          </Notice>
        )}
      </Section>
    </>
  );
}

function NotFound({ back }: { back: React.ReactNode }) {
  return (
    <>
      {back}
      <Notice>We could not find that game.</Notice>
    </>
  );
}
