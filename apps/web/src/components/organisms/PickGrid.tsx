import type { DeviceView } from '@perch/core';
import { FeedbackActions, GameCard } from '../molecules';
import { useCardReturn } from '@/hooks/useCardReturn';
import { CARD_GRID, CARD_GRID_SIZES } from '@/lib/cardWidth';
import { cardChips, similarPath, type Recommendation } from '@/lib/forYou';
import type { FeedbackMap } from '@/lib/feedback';
import type { FeedbackKind } from '@perch/core';

export type PickGridProps = {
  picks: readonly Recommendation[];
  devices: readonly DeviceView[];
  /** The device the picks were filtered for (or All). */
  deviceId: string;
  feedback: FeedbackMap;
  onSend: (igdbId: number, kind: FeedbackKind) => void;
  /** Optional line under each title, e.g. the tags a pick shares with a seed game. */
  metaFor?: (pick: Recommendation) => string | undefined;
};

/** Picks as a cover grid with the feedback and "More like this" overlay on each card. */
export function PickGrid({ picks, devices, deviceId, feedback, onSend, metaFor }: PickGridProps) {
  const cardReturn = useCardReturn();
  return (
    <ul className={CARD_GRID}>
      {picks.map((r) => {
        const id = r.game.igdbId;
        return (
          <li key={id}>
            <GameCard
              title={r.game.name}
              coverUrl={r.game.coverUrl}
              coverUrlSmall={r.game.coverUrlSmall}
              accent={r.game.accent}
              chips={cardChips(r, devices, deviceId)}
              meta={metaFor?.(r)}
              sizes={CARD_GRID_SIZES}
              layoutId={cardReturn.coverId(id)}
              fadeIn={cardReturn.fadeIn}
              className="w-full"
              to={`/games/${id}`}
              actions={
                <FeedbackActions
                  value={feedback[id]}
                  onSend={(kind) => onSend(id, kind)}
                  moreLikeTo={similarPath(id, deviceId)}
                />
              }
            />
          </li>
        );
      })}
    </ul>
  );
}
