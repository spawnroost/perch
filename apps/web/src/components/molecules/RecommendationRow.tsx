import { Link } from 'react-router';
import type { FeedbackKind, RecommendationsResponse } from '@perch/core';
import { Badge } from '../atoms';
import { FeedbackActions } from './FeedbackActions';
import { FitRow } from './FitRow';
import type { FitChip } from '@/lib/forYou';

export interface RecommendationRowProps {
  rank: number;
  rec: RecommendationsResponse['recommendations'][number];
  chips: readonly FitChip[];
  feedback?: FeedbackKind;
  onFeedback: (kind: FeedbackKind) => void;
}

export function RecommendationRow({
  rank,
  rec,
  chips,
  feedback,
  onFeedback,
}: RecommendationRowProps) {
  return (
    <li className="flex items-start gap-3 border-b border-line px-3 py-3 last:border-b-0">
      <span className="w-5 pt-0.5 text-sm text-fg-subtle tabular-nums">{rank}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <Link
            to={`/games/${rec.game.igdbId}`}
            className="truncate rounded-sm text-base font-medium text-fg hover:text-coral"
          >
            {rec.game.name}
          </Link>
          {rec.backlog && <Badge>Backlog</Badge>}
        </div>
        <p className="text-sm text-fg-muted">{rec.reason}</p>
        <FitRow chips={chips} />
      </div>
      <FeedbackActions value={feedback} onSend={onFeedback} />
    </li>
  );
}
