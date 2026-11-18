import type { AboutRow } from '@/lib/gameFacts';

/** Label / value cells of the game facts, in a responsive grid. */
export function AboutList({ rows }: { rows: readonly AboutRow[] }) {
  return (
    <dl className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2">
      {rows.map((r) => (
        <div key={r.label} className="flex flex-col gap-0.5 bg-surface-1 px-3 py-2">
          <dt className="font-hud text-2xs text-fg-subtle">{r.label}</dt>
          <dd className={r.value ? 'text-base text-fg' : 'text-base text-fg-subtle'}>
            {r.value ?? 'Unknown'}
          </dd>
        </div>
      ))}
    </dl>
  );
}
