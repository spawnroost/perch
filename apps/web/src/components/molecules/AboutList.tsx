import type { AboutRow } from '@/lib/gameFacts';

/** Label / value rows of the game facts. */
export function AboutList({ rows }: { rows: readonly AboutRow[] }) {
  return (
    <dl className="overflow-hidden rounded-lg border border-line bg-surface-1">
      {rows.map((r) => (
        <div
          key={r.label}
          className="flex flex-col gap-0.5 border-b border-line px-3 py-2 last:border-b-0"
        >
          <dt className="font-hud text-2xs text-fg-subtle">{r.label}</dt>
          <dd className="text-base text-fg">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}
