import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { Notice, Skeleton } from '../atoms';
import { GameCard, LoadError } from '../molecules';
import { CARD_GRID } from '@/lib/cardWidth';

export type PickGridPageProps = {
  back: { to: string; label: string };
  /** Title and game count once loaded; null until then. */
  heading: { title: string; count: number } | null;
  /** Title when there is no heading but nothing is loading either (failed, or an empty result). */
  fallbackTitle: string;
  /** The query that failed, if any: shows the error with a Retry. */
  failure: { error: Error; refetch: () => unknown } | null;
  /** The thing asked for does not exist: shows this instead of the error, with no Retry. */
  notFound?: string | undefined;
  /** Everything the page needs has loaded. */
  ready: boolean;
  /** Error from a feedback action. */
  actionError?: Error | null | undefined;
  /** What to show once loaded: the grid, or an empty notice. */
  children?: ReactNode;
};

/** Shell of a full cover-grid page: back link, title and count, error and loading states. */
export function PickGridPage({
  back,
  heading,
  fallbackTitle,
  failure,
  notFound,
  ready,
  actionError,
  children,
}: PickGridPageProps) {
  const failed = failure !== null || notFound !== undefined;
  return (
    <section className="flex w-full flex-col gap-6 px-gutter py-6">
      <div className="flex flex-col gap-2">
        <Link
          to={back.to}
          className="inline-flex w-fit items-center gap-1 rounded-sm text-sm text-fg-muted hover:text-fg"
        >
          <ArrowLeft size={14} strokeWidth={1.75} aria-hidden />
          {back.label}
        </Link>
        {heading ? (
          <>
            <h1 className="font-title text-3xl text-fg">{heading.title}</h1>
            <p className="text-sm text-fg-muted tabular-nums">
              {heading.count} {heading.count === 1 ? 'game' : 'games'}
            </p>
          </>
        ) : (
          <h1 className="font-title text-3xl text-fg">
            {failed || ready ? fallbackTitle : <Skeleton className="h-9 w-64" />}
          </h1>
        )}
      </div>
      {actionError && <Notice tone="error">{actionError.message}</Notice>}
      {notFound !== undefined && <Notice>{notFound}</Notice>}
      {failure && notFound === undefined && (
        <LoadError message={failure.error.message} onRetry={() => void failure.refetch()} />
      )}
      {!failed && !ready && (
        <div aria-busy className={CARD_GRID}>
          {Array.from({ length: 12 }, (_, i) => (
            <GameCard key={i} skeleton title="" className="w-full" />
          ))}
        </div>
      )}
      {children}
    </section>
  );
}
