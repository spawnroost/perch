import { Link, useLocation, useNavigate } from 'react-router';
import { motion } from 'motion/react';
import { Check, ChevronLeft, Plus } from 'lucide-react';
import { Badge, Button, Cover, DeckBadge, Notice, Skeleton } from '../atoms';
import { FeedbackActions, FitChips, FitDetailRow, Hero, LoadError } from '../molecules';
import { useAddToLibrary, useFeedback, useGameDetail, useLibrary } from '@/hooks/queries';
import { useReduced } from '@/hooks/useMotionPrefs';
import { ApiError } from '@/lib/api';
import { coverImage } from '@/lib/coverSrcSet';
import { coverLayoutId } from '@/lib/motion';
import { releaseYear } from '@/lib/onboarding';
import { platformNames } from '@/lib/platforms';
import { timeToBeatLabel } from '@/lib/timeToBeat';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-fg-muted">{title}</h2>
      {children}
    </section>
  );
}

/** Back to where the visitor came from; to For you when this page was the entry point. */
function BackLink() {
  const navigate = useNavigate();
  // React Router gives the first entry of a session the key 'default'.
  const hasHistory = useLocation().key !== 'default';
  return (
    <Link
      to="/"
      onClick={(e) => {
        if (!hasHistory) return;
        e.preventDefault();
        void navigate(-1);
      }}
      className="inline-flex w-fit items-center gap-1 rounded-sm text-sm text-fg-muted hover:text-fg"
    >
      <ChevronLeft size={14} strokeWidth={1.75} aria-hidden />
      {hasHistory ? 'Back' : 'For you'}
    </Link>
  );
}

export function GameDetail({ igdbId }: { igdbId: number | null }) {
  const detail = useGameDetail(igdbId);
  const library = useLibrary();
  const add = useAddToLibrary();
  const { feedback, send, error: feedbackError } = useFeedback();
  const reduced = useReduced();
  const layoutId = igdbId === null ? undefined : coverLayoutId(igdbId, reduced);
  const back = (
    <div className="px-6 pt-1">
      <BackLink />
    </div>
  );

  if (igdbId === null) return <NotFound back={back} />;
  if (detail.isPending) {
    return (
      <>
        {back}
        <div className="flex gap-4 px-8" aria-busy>
          <motion.div layoutId={layoutId} className="w-40 shrink-0">
            <Skeleton className="aspect-3/4 w-full" />
          </motion.div>
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
        <div className="px-6">
          <LoadError message={detail.error.message} onRetry={() => void detail.refetch()} />
        </div>
      </>
    );
  }

  const { game, fit, deck, why, timeToBeat } = detail.data;
  const toBeat = timeToBeatLabel(timeToBeat);
  const year = releaseYear(game.firstRelease);
  const platforms = platformNames(game.platforms);
  const inLibrary = library.data?.some((e) => e.igdbId === game.igdbId) ?? false;

  const image = coverImage(game.coverUrl, game.coverUrlSmall);

  return (
    <div className="flex flex-col gap-6 pb-12">
      {back}
      <Hero
        title={game.name}
        heroUrl={game.heroUrl}
        accent={game.accent}
        cover={
          <motion.div layoutId={layoutId} className="w-32 shrink-0 sm:w-40">
            <Cover
              src={image?.src ?? null}
              srcSet={image?.srcSet}
              sizes="10rem"
              alt={`${game.name} cover`}
              className="w-full rounded-lg"
            />
          </motion.div>
        }
        meta={
          <>
            <p className="w-full text-sm tabular-nums">
              {[year, game.rating !== null && `Rated ${Math.round(game.rating)}`, toBeat]
                .filter(Boolean)
                .join(' · ')}
            </p>
            {deck && <DeckBadge category={deck} />}
            {platforms.map((p) => (
              <Badge key={p}>{p}</Badge>
            ))}
            <FitChips fits={fit} className="w-full" />
          </>
        }
        actions={
          <>
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
              onSend={(kind) => send(game.igdbId, kind)}
            />
          </>
        }
      />
      <div className="flex max-w-3xl flex-col gap-6 px-8">
        {add.isError && <Notice tone="error">{add.error.message}</Notice>}
        {feedbackError && <Notice tone="error">{feedbackError.message}</Notice>}
        {game.summary && (
          <Section title="About">
            <p className="text-base text-fg">{game.summary}</p>
          </Section>
        )}

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
                <FitDetailRow
                  key={f.deviceId}
                  deviceName={f.deviceName}
                  status={f.status}
                  reason={f.reason}
                />
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
      </div>
    </div>
  );
}

function NotFound({ back }: { back: React.ReactNode }) {
  return (
    <>
      {back}
      <div className="px-6">
        <Notice>We could not find that game.</Notice>
      </div>
    </>
  );
}
