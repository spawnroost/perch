import { Notice, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from '../atoms';
import { PickRow } from '../molecules';
import { useDevices, useRecommendations } from '@/hooks/queries';

const NO_DEVICE = 'none';

function PickList({ device }: { device: string }) {
  const picks = useRecommendations(device);
  if (picks.isPending) return <Skeleton className="h-40" />;
  if (picks.isError) return <Notice tone="error">{picks.error.message}</Notice>;
  if (picks.data.length === 0) {
    return <Notice>No picks yet. Add more games with hours played to sharpen them.</Notice>;
  }
  return (
    <ul className="overflow-hidden rounded-lg border border-line bg-surface-1">
      {picks.data.map((r) => (
        <PickRow
          key={r.game.igdbId}
          rank={r.rank}
          name={r.game.name}
          reason={r.reason}
          fit={r.fit?.status}
        />
      ))}
    </ul>
  );
}

export function PicksStep() {
  const devices = useDevices();
  if (devices.isPending) return <Skeleton className="h-40" />;
  if (devices.isError) return <Notice tone="error">{devices.error.message}</Notice>;
  if (devices.data.length === 0) return <PickList device={NO_DEVICE} />;

  const [first] = devices.data;
  return (
    <Tabs defaultValue={first!.id}>
      <TabsList>
        {devices.data.map((d) => (
          <TabsTrigger key={d.id} value={d.id}>
            {d.name}
          </TabsTrigger>
        ))}
      </TabsList>
      {devices.data.map((d) => (
        <TabsContent key={d.id} value={d.id}>
          <PickList device={d.id} />
        </TabsContent>
      ))}
    </Tabs>
  );
}
