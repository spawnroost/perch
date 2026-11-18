import type { GameDetailResponse } from '@perch/core';
import { AboutList, DetailSection, RatingTile, StoreLinks, TimeToBeatBars } from '../molecules';
import { aboutRows, criticSummary, externalUrl, steamReviewsSummary } from '@/lib/gameFacts';
import { timeToBeatTiers } from '@/lib/timeToBeat';

export interface GameFactsRailProps {
  facts: GameDetailResponse['facts'];
  timeToBeat: GameDetailResponse['timeToBeat'];
  steamAppId: number | null;
}

/** Ratings, time to beat, where to buy and the game facts; a block with no data is not rendered. */
export function GameFactsRail({ facts, timeToBeat, steamAppId }: GameFactsRailProps) {
  const critic = criticSummary(facts.critic);
  const steam = steamReviewsSummary(facts.steamReviews, steamAppId);
  const beat = timeToBeatTiers(timeToBeat);
  const stores = facts.stores.filter((s) => externalUrl(s.url));
  const links = facts.links.filter((l) => externalUrl(l.url));
  const rows = aboutRows(facts.about);

  return (
    <>
      {critic || steam ? (
        <DetailSection title="Ratings">
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
        </DetailSection>
      ) : null}
      {beat ? (
        <DetailSection title="How long to beat">
          <TimeToBeatBars tiers={beat.tiers} source={beat.source} />
        </DetailSection>
      ) : null}
      {stores.length > 0 || links.length > 0 ? (
        <DetailSection title="Where to buy">
          <StoreLinks stores={stores} links={links} />
        </DetailSection>
      ) : null}
      {rows.length > 0 ? (
        <DetailSection title="Details">
          <AboutList rows={rows} />
        </DetailSection>
      ) : null}
    </>
  );
}
