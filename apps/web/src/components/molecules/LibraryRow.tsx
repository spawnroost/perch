import { Link } from 'react-router';
import { Pencil } from 'lucide-react';
import type { LibraryEntry } from '@perch/core';
import { Badge, Button, Cover } from '../atoms';
import { formatHours, formatLastPlayed, STATUS_LABEL } from '@/lib/library';

export function LibraryRow({ entry, onEdit }: { entry: LibraryEntry; onEdit: () => void }) {
  return (
    <li className="flex items-center gap-3 border-b border-line px-3 py-2.5 last:border-b-0">
      <Cover src={entry.coverUrl} alt="" className="w-9 shrink-0" />
      <div className="min-w-0 flex-1">
        <Link
          to={`/games/${entry.igdbId}`}
          className="block truncate rounded-sm text-base font-medium text-fg hover:text-accent"
        >
          {entry.name}
        </Link>
        <p className="truncate text-sm text-fg-muted tabular-nums">
          {formatHours(entry.hoursPlayed)} · {formatLastPlayed(entry.lastPlayed, entry.hoursPlayed)}
        </p>
      </div>
      <Badge tone={entry.status === 'playing' ? 'accent' : 'neutral'}>
        {STATUS_LABEL[entry.status]}
      </Badge>
      <Button variant="ghost" size="icon" aria-label={`Edit ${entry.name}`} onClick={onEdit}>
        <Pencil size={14} strokeWidth={1.75} aria-hidden />
      </Button>
    </li>
  );
}
