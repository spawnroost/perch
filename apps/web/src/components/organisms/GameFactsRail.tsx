import type { GameDetailResponse } from '@perch/core';
import { motion } from 'motion/react';
import {
  AboutList,
  DetailSection,
  ExternalLinks,
  RatingTile,
  StoreLinks,
  TimeToBeatBars,
} from '../molecules';
import { GamePrices } from './GamePrices';
import { useReduced } from '@/hooks/useMotionPrefs';
import { fadeTransition } from '@/lib/motion';
import { aboutRows, criticSummary, externalUrl, steamReviewsSummary } from '@/lib/gameFacts';
import { timeToBeatTiers } from '@/lib/timeToBeat';

export interface GameFactsRailProps {
  facts: GameDetailResponse['facts'];
  timeToBeat: GameDetailResponse['timeToBeat'];
  steamAppId: number | null;
  igdbId: number;
}

function useFacts({ facts, timeToBeat, steamAppId }: GameFactsRailProps) {
  return {
    critic: criticSummary(facts.critic),
    steam: steamReviewsSummary(facts.steamReviews, steamAppId),
    beat: timeToBeatTiers(timeToBeat),
    stores: facts.stores.filter((s) => externalUrl(s.url)),
    links: facts.links.filter((l) => externalUrl(l.url)),
    rows: aboutRows(facts.about),
  };
}

function FadeIn({ children }: { children: React.ReactNode }) {
  const reduced = useReduced();
  return (
    <motion.div
      className="flex flex-col gap-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={fadeTransition(reduced)}
    >
      {children}
    </motion.div>
  );
}

/** Rail facts for the buy decision: ratings and where to buy. Every block always renders. */
export function GameFactsRail(props: GameFactsRailProps) {
  const { critic, steam, stores } = useFacts(props);

  return (
    <FadeIn>
      <DetailSection title="Ratings" empty={critic || steam ? undefined : 'No ratings yet.'}>
        {critic || steam ? (
          <div className="grid grid-cols-2 gap-2">
            {critic ? (
              <RatingTile label="Critics" score={critic.score} caption={critic.caption} />
            ) : null}
            {steam ? (
              <RatingTile
                label="Steam"
                score={steam.score}
                scoreSuffix="positive"
                caption={steam.desc}
                detail={steam.total}
                href={steam.url}
              />
            ) : null}
          </div>
        ) : null}
      </DetailSection>
      <DetailSection title="Where to buy">
        <GamePrices igdbId={props.igdbId} />
        {stores.length > 0 ? (
          <StoreLinks stores={stores} />
        ) : (
          <p className="text-sm text-fg-subtle">No store links listed.</p>
        )}
      </DetailSection>
    </FadeIn>
  );
}

/** Main-column facts: time to beat, details and review links. Every block always renders. */
export function GameFactsBody(props: GameFactsRailProps) {
  const { beat, links, rows } = useFacts(props);

  return (
    <FadeIn>
      <DetailSection title="How long to beat" empty={beat ? undefined : 'No play-time data yet.'}>
        {beat ? (
          <div className="max-w-2xl">
            <TimeToBeatBars tiers={beat.tiers} source={beat.source} />
          </div>
        ) : null}
      </DetailSection>
      <DetailSection title="Details">
        <AboutList rows={rows} />
      </DetailSection>
      <DetailSection
        title="Reviews & discussion"
        empty={links.length > 0 ? undefined : 'No review links.'}
      >
        <ExternalLinks links={links} />
      </DetailSection>
    </FadeIn>
  );
}
