import { useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { Button, Input } from '../atoms';
import { parseHours } from '@/lib/onboarding';

export interface GameResultRowProps {
  name: string;
  year: number | null;
  added: boolean;
  pending: boolean;
  onAdd: (hours: number | undefined) => void;
}

export function GameResultRow({ name, year, added, pending, onAdd }: GameResultRowProps) {
  const [hours, setHours] = useState('');
  const parsed = parseHours(hours);
  const invalid = parsed === null;

  return (
    <li className="flex items-center gap-3 border-b border-line px-3 py-2 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-base text-fg">{name}</p>
        {year && <p className="text-xs text-fg-subtle tabular-nums">{year}</p>}
      </div>
      {added ? (
        <span className="flex items-center gap-1.5 text-sm text-fit-yes">
          <Check size={14} strokeWidth={1.75} aria-hidden />
          In library
        </span>
      ) : (
        <>
          <Input
            inputMode="decimal"
            placeholder="Hours"
            aria-label={`Hours played in ${name}`}
            aria-invalid={invalid || undefined}
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            className="w-20 tabular-nums"
          />
          <Button
            variant="secondary"
            loading={pending}
            disabled={invalid}
            aria-label={`Add ${name}`}
            onClick={() => onAdd(parsed ?? undefined)}
          >
            <Plus size={14} strokeWidth={1.75} aria-hidden />
            Add
          </Button>
        </>
      )}
    </li>
  );
}
