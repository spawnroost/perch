import { Link } from 'react-router';
import { Check, EyeOff, Sparkles, ThumbsUp, type LucideIcon } from 'lucide-react';
import type { FeedbackKind } from '@perch/core';
import { Button } from '../atoms';

const ACTIONS: { kind: FeedbackKind; label: string; Icon: LucideIcon }[] = [
  { kind: 'up', label: 'Like', Icon: ThumbsUp },
  { kind: 'not_interested', label: 'Not interested', Icon: EyeOff },
  { kind: 'played', label: 'Played', Icon: Check },
];

export interface FeedbackActionsProps {
  /** Feedback already sent for this game. */
  value?: FeedbackKind;
  onSend: (kind: FeedbackKind) => void;
  /** Adds a "More like this" link to this route (the game's similar grid). */
  moreLikeTo?: string;
  /** Show text next to the icons. */
  labels?: boolean;
}

export function FeedbackActions({
  value,
  onSend,
  moreLikeTo,
  labels = false,
}: FeedbackActionsProps) {
  return (
    <div role="group" aria-label="Feedback" className="flex items-center gap-1">
      {ACTIONS.map(({ kind, label, Icon }) => (
        <Button
          key={kind}
          variant={value === kind ? 'secondary' : 'ghost'}
          size={labels ? 'sm' : 'icon'}
          aria-pressed={value === kind}
          aria-label={labels ? undefined : label}
          title={label}
          onClick={() => onSend(kind)}
        >
          <Icon size={14} strokeWidth={1.75} aria-hidden />
          {labels && label}
        </Button>
      ))}
      {moreLikeTo && (
        <Button
          asChild
          variant="ghost"
          size={labels ? 'sm' : 'icon'}
          aria-label={labels ? undefined : 'More like this'}
          title="More like this"
        >
          <Link to={moreLikeTo}>
            <Sparkles size={14} strokeWidth={1.75} aria-hidden />
            {labels && 'More like this'}
          </Link>
        </Button>
      )}
    </div>
  );
}
