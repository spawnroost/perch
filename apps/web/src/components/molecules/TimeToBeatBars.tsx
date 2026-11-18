import type { TimeToBeatTier } from '@/lib/timeToBeat';

/** Story / Story + extras / 100% as labelled bars scaled to the longest tier. */
export function TimeToBeatBars({
  tiers,
  source,
}: {
  tiers: readonly TimeToBeatTier[];
  source: string | null;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-1 p-3 shadow-raised">
      <ul className="flex flex-col gap-3">
        {tiers.map((t) => (
          <li key={t.key} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-fg-muted">{t.label}</span>
              <span className="font-hud text-lg text-fg tabular-nums">{t.hours}</span>
            </div>
            <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-surface-3">
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${t.share * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
      {source ? <p className="text-xs text-fg-subtle">{source}</p> : null}
    </div>
  );
}
