import { Badge, Button } from '../atoms';

const PLATFORMS = ['Steam', 'Xbox', 'PlayStation'] as const;

/** Placeholder for platform connectors (a later phase). No behaviour. */
export function ConnectorsComingSoon() {
  return (
    <div
      aria-disabled
      className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-line px-3 py-2"
    >
      <span className="text-sm text-fg-subtle">Connect</span>
      {PLATFORMS.map((platform) => (
        <Button key={platform} variant="ghost" size="sm" disabled>
          {platform}
        </Button>
      ))}
      <Badge tone="neutral" className="ml-auto">
        Coming soon
      </Badge>
    </div>
  );
}
