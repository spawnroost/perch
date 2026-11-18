import type { ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';

export interface RatingTileProps {
  /** Source name, e.g. "Critics" or "Steam". */
  label: string;
  /** The big HUD number. */
  score: string;
  /** Spoken in place of the bare number, e.g. "positive". */
  scoreSuffix?: string;
  /** Verdict line under the number. */
  caption: ReactNode;
  detail?: string;
  /** Makes the whole tile an external link. */
  href?: string | null;
}

const TILE =
  'flex min-w-0 flex-col gap-0.5 rounded-lg border border-line bg-surface-1 p-3 shadow-raised';

/** HUD stat tile: source label, big Archivo number, verdict and a detail line. */
export function RatingTile({ label, score, scoreSuffix, caption, detail, href }: RatingTileProps) {
  const body = (
    <>
      <span className="flex items-center justify-between gap-2 font-hud text-2xs text-fg-subtle">
        {label}
        {href ? <ExternalLink size={12} strokeWidth={1.75} aria-hidden /> : null}
      </span>
      <span className="font-hud text-3xl text-accent tabular-nums">
        {score}
        {scoreSuffix ? <span className="sr-only"> {scoreSuffix}</span> : null}
      </span>
      <span className="text-sm text-fg">{caption}</span>
      {detail ? <span className="text-xs text-fg-subtle">{detail}</span> : null}
    </>
  );
  if (!href) return <div className={TILE}>{body}</div>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`${TILE} transition-colors duration-fast ease-out hover:bg-surface-2`}
    >
      {body}
    </a>
  );
}
