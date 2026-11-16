import { Select } from '../atoms';
import type { ImportRow } from '@/lib/importPreview';

const SKIP = 'skip';

export function ImportRowItem({
  row,
  onSelect,
}: {
  row: ImportRow;
  onSelect: (igdbId: number | null) => void;
}) {
  return (
    <li className="flex flex-col gap-1.5 border-b border-line px-3 py-2.5 last:border-b-0">
      <p className="truncate text-sm text-fg-muted">
        Line {row.line}: <span className="text-fg">{row.name}</span>
      </p>
      <Select
        aria-label={`Match for ${row.name}`}
        value={row.selected === null ? SKIP : String(row.selected)}
        onChange={(e) => onSelect(e.target.value === SKIP ? null : Number(e.target.value))}
      >
        <option value={SKIP}>{row.options.length === 0 ? 'No match, skipped' : 'Skip'}</option>
        {row.options.map((o) => (
          <option key={o.igdbId} value={o.igdbId}>
            {o.year ? `${o.name} (${o.year})` : o.name}
          </option>
        ))}
      </Select>
    </li>
  );
}
