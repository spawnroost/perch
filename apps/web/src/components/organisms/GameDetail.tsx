import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { motion } from 'motion/react';
import { Check, ChevronLeft, Plus } from 'lucide-react';
import { Badge, Button, Cover, DeckBadge, Notice, Skeleton } from '../atoms';
import {
  DetailSection,
  FeedbackActions,
  FitChips,
  FitDetailRow,
  Hero,
  LoadError,
} from '../molecules';
import { GameFactsBody, GameFactsRail } from './GameFactsRail';
import { Soundtrack } from './Soundtrack';
import { useAddToLibrary, useFeedback, useGameDetail, useLibrary } from '@/hooks/queries';
import { useReduced } from '@/hooks/useMotionPrefs';
import { accentStyle } from '@/lib/accent';
import { ApiError } from '@/lib/api';
import { coverImage } from '@/lib/coverSrcSet';
import { coverLayoutId, fadeTransition } from '@/lib/motion';
import { releaseYear } from '@/lib/onboarding';
import { ALL_TAB, platformChips, similarPath } from '@/lib/forYou';
import { platformNames } from '@/lib/platforms';
import { timeToBeatLabel } from '@/lib/timeToBeat';

/** Sized once so the loading skeleton and the loaded cover are the same shared-element target. */
const COVER_BOX = 'w-28 shrink-0 sm:w-40 md:w-55';

/** Fades its content in when it first appears (keyed swaps from placeholder to real data included). */
function Reveal({ skip, children }: { skip?: boolean; children: React.ReactNode }) {
  const reduced = useReduced();
  return (
    <motion.div
      initial={skip ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={fadeTransition(reduced)}
    >
      {children}
    </motion.div>
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
      className="inline-flex w-fit items-center gap-1 rounded-full bg-ground/60 py-1 pr-3 pl-2 text-sm text-fg-muted backdrop-blur-sm hover:text-fg"
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
  const [allPlatforms, setAllPlatforms] = useState(false);
  const reduced = useReduced();
  const layoutId = igdbId === null ? undefined : coverLayoutId(igdbId, reduced);
  const back = <BackLink />;
  // Before the hero exists (loading, error, not found) the link sits on the page itself.
  const standaloneBack = <div className="px-gutter pt-4">{back}</div>;

  if (igdbId === null) return <NotFound back={standaloneBack} />;
  if (detail.isPending) {
    return (
      <>
        {standaloneBack}
        <div className="flex gap-4 px-gutter" aria-busy>
          <motion.div layoutId={layoutId} className={COVER_BOX}>
            <Skeleton className="aspect-3/4 w-full" />
          </motion.div>
          <Skeleton className="h-32 flex-1" />
        </div>
      </>
    );
  }
  if (detail.isError) {
    if (detail.error instanceof ApiError && detail.error.status === 404) {
      return <NotFound back={standaloneBack} />;
    }
    return (
      <>
        {standaloneBack}
        <div className="px-gutter">
          <LoadError message={detail.error.message} onRetry={() => void detail.refetch()} />
        </div>
      </>
    );
  }

  // Placeholder data comes from the clicked card: art and fit, but no summary or reasons yet.
  const seeded = detail.isPlaceholderData;
  const { game, fit, deck, why, timeToBeat, facts } = detail.data;
  const toBeat = timeToBeatLabel(timeToBeat);
  const year = releaseYear(game.firstRelease);
  const platforms = platformChips(platformNames(game.platforms), allPlatforms);
  const inLibrary = library.data?.some((e) => e.igdbId === game.igdbId) ?? false;

  const image = coverImage(game.coverUrl, game.coverUrlSmall);

  return (
    <div className="flex flex-col gap-6 pb-12">
      <Hero
        overlay={back}
        title={game.name}
        heroUrl={game.heroUrl}
        accent={game.accent}
        cover={
          <motion.div layoutId={layoutId} className={COVER_BOX}>
            <Cover
              src={image?.src ?? null}
              srcSet={image?.srcSet}
              sizes="(min-width: 768px) 14rem, 10rem"
              alt={`${game.name} cover`}
              label={game.name}
              className="w-full rounded-lg shadow-cover-glow"
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
            {platforms.map((p) =>
              p.srLabel ? (
                // The "+N" chip: a button that lists the rest.
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setAllPlatforms(true)}
                  className="cursor-pointer rounded-md focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <Badge title={p.srLabel}>
                    <span aria-hidden>{p.label}</span>
                    <span className="sr-only">Show all platforms ({p.srLabel})</span>
                  </Badge>
                </button>
              ) : (
                <Badge key={p.label}>{p.label}</Badge>
              ),
            )}
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
              moreLikeTo={similarPath(game.igdbId, ALL_TAB)}
            />
          </>
        }
      />
      <div className="grid gap-x-12 gap-y-8 px-gutter lg:grid-cols-[minmax(0,1fr)_var(--container-rail)]">
        <div className="flex min-w-0 flex-col gap-8">
          {add.isError && <Notice tone="error">{add.error.message}</Notice>}
          {feedbackError && <Notice tone="error">{feedbackError.message}</Notice>}
          {seeded ? (
            <Skeleton className="h-40 w-full" aria-busy />
          ) : (
            <Reveal>
              <div className="flex flex-col gap-8">
                <DetailSection
                  title="About"
                  empty={game.summary ? undefined : 'No description yet.'}
                >
                  <p className="max-w-prose text-base text-fg">{game.summary}</p>
                </DetailSection>

                <DetailSection title="Why it's recommended">
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
                      Nothing in your library points to this game yet. Add more games with hours
                      played.
                    </p>
                  )}
                </DetailSection>
              </div>
            </Reveal>
          )}
          {!seeded && (
            <GameFactsBody facts={facts} timeToBeat={timeToBeat} steamAppId={game.steamAppId} />
          )}
        </div>

        <aside
          style={accentStyle(game.accent)}
          className="flex flex-col gap-8 lg:sticky lg:top-16 lg:self-start"
        >
          {seeded && fit.length === 0 ? (
            <DetailSection title="Will it run">
              <Skeleton className="h-24 w-full" aria-busy />
            </DetailSection>
          ) : (
            <Reveal skip={seeded}>
              <DetailSection title="Will it run">
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
              </DetailSection>
            </Reveal>
          )}
          {seeded ? (
            <Skeleton className="h-40 w-full" aria-busy />
          ) : (
            <GameFactsRail facts={facts} timeToBeat={timeToBeat} steamAppId={game.steamAppId} />
          )}
          {seeded ? null : <Soundtrack igdbId={game.igdbId} />}
        </aside>
      </div>
    </div>
  );
}

function NotFound({ back }: { back: React.ReactNode }) {
  return (
    <>
      {back}
      <div className="px-gutter">
        <Notice>We could not find that game.</Notice>
      </div>
    </>
  );
}
