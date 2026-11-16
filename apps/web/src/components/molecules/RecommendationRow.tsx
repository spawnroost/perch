import { Link } from 'react-router';
import type { FeedbackKind } from '@perch/core';
import { Badge, Cover, DeckBadge } from '../atoms';
import { FeedbackActions } from './FeedbackActions';
import { FitRow } from './FitRow';
import type { Recommendation } from '@/lib/forYou';
import { timeToBeatLabel } from '@/lib/timeToBeat';

export interface RecommendationRowProps {
  rank: number;
  rec: Recommendation;
  feedback?: FeedbackKind;
  onFeedback: (kind: FeedbackKind) => void;
}

export function RecommendationRow({ rank, rec, feedback, onFeedback }: RecommendationRowProps) {
  const toBeat = timeToBeatLabel(rec.timeToBeat);
  return (
    <li className="flex items-start gap-3 border-b border-line px-3 py-3 last:border-b-0">
      <span className="w-5 pt-0.5 text-sm text-fg-subtle tabular-nums">{rank}</span>
      <Cover src={rec.game.coverUrl} alt={`${rec.game.name} cover`} className="w-12 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <Link
            to={`/games/${rec.game.igdbId}`}
            className="truncate rounded-sm text-base font-medium text-fg hover:text-coral"
          >
            {rec.game.name}
          </Link>
          {rec.backlog && <Badge>Backlog</Badge>}
          {rec.deck && <DeckBadge category={rec.deck} />}
        </div>
        <p className="text-sm text-fg-muted">{rec.reason}</p>
        {toBeat && <p className="text-xs text-fg-subtle tabular-nums">{toBeat}</p>}
        <FitRow fits={rec.fits} />
      </div>
      <FeedbackActions value={feedback} onSend={onFeedback} />
    </li>
  );
}
