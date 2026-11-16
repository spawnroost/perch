import { useState } from 'react';
import { Link } from 'react-router';
import type { DeviceView } from '@perch/core';
import { Notice, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from '../atoms';
import { LoadError, RecommendationRow } from '../molecules';
import { useDevices, useFeedback, useRecommendations } from '@/hooks/queries';
import { ALL_TAB, buildTabs, FOR_YOU_LIMIT } from '@/lib/forYou';

interface FeedListProps {
  tab: string;
  hasDevices: boolean;
}

function FeedList({ tab, hasDevices }: FeedListProps) {
  const feed = useRecommendations(tab, FOR_YOU_LIMIT);
  const { feedback, send, error } = useFeedback();

  if (feed.isPending) {
    return (
      <div className="flex flex-col gap-2" aria-busy>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    );
  }
  if (feed.isError) {
    return <LoadError message={feed.error.message} onRetry={() => void feed.refetch()} />;
  }

  if (feed.data.length === 0) {
    return (
      <Notice>
        {hasDevices ? (
          'No picks for this view. Add more games with hours played to sharpen them.'
        ) : (
          <>
            No picks yet.{' '}
            <Link to="/devices" className="text-fg underline underline-offset-4">
              Add a device
            </Link>{' '}
            to see what it can run.
          </>
        )}
      </Notice>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <Notice tone="error">{error.message}</Notice>}
      <ul className="overflow-hidden rounded-lg border border-line bg-surface-1">
        {feed.data.map((r, i) => (
          <RecommendationRow
            key={r.game.igdbId}
            rank={i + 1}
            rec={r}
            feedback={feedback[r.game.igdbId]}
            onFeedback={(kind) => send(r.game.igdbId, kind)}
          />
        ))}
      </ul>
    </div>
  );
}

function Feeds({ devices }: { devices: DeviceView[] }) {
  const tabs = buildTabs(devices);
  const [selected, setSelected] = useState(ALL_TAB);
  // A tab whose device was removed falls back to All.
  const tab = tabs.some((t) => t.value === selected) ? selected : ALL_TAB;

  return (
    <Tabs value={tab} onValueChange={setSelected}>
      {tabs.length > 1 && (
        <TabsList className="max-w-full overflow-x-auto">
          {tabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      )}
      {tabs.map((t) => (
        <TabsContent key={t.value} value={t.value}>
          <FeedList tab={t.value} hasDevices={devices.length > 0} />
        </TabsContent>
      ))}
    </Tabs>
  );
}

export function ForYou() {
  const devices = useDevices();
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-display text-fg">For you</h1>
      {devices.isPending ? (
        <Skeleton className="h-40" />
      ) : devices.isError ? (
        <LoadError message={devices.error.message} onRetry={() => void devices.refetch()} />
      ) : (
        <Feeds devices={devices.data} />
      )}
    </>
  );
}
