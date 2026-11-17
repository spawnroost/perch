import { useState, type FormEvent } from 'react';
import { Check, Plus } from 'lucide-react';
import { Button, Cover, Input } from '../atoms';
import { coverImage } from '@/lib/coverSrcSet';
import { parseHours } from '@/lib/onboarding';

export interface GameResultCardProps {
  name: string;
  year?: number;
  coverUrl?: string | null;
  coverUrlSmall?: string | null;
  added: boolean;
  pending: boolean;
  /** Results shown are stale (a newer search is loading). */
  disabled?: boolean;
  onAdd: (hours: number | undefined) => void;
}

const COVER_SIZES = '(min-width: 32rem) 10rem, 8rem';

/** A search result as cover art with an optional-hours quick add underneath. */
export function GameResultCard({
  name,
  year,
  coverUrl,
  coverUrlSmall,
  added,
  pending,
  disabled,
  onAdd,
}: GameResultCardProps) {
  const [hours, setHours] = useState('');
  const parsed = parseHours(hours);
  const invalid = parsed === null;
  const image = coverImage(coverUrl, coverUrlSmall);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!invalid && !disabled && !pending) onAdd(parsed);
  }

  return (
    <li className="flex min-w-0 flex-col gap-2">
      <div className="relative">
        <Cover
          src={image?.src ?? null}
          srcSet={image?.srcSet}
          sizes={COVER_SIZES}
          alt=""
          className="w-full rounded-lg"
        />
        {added && (
          <span className="absolute inset-x-2 bottom-2 flex items-center justify-center gap-1.5 rounded-md bg-ground/80 py-1 text-sm text-fit-yes">
            <Check size={14} strokeWidth={1.75} aria-hidden />
            In library
          </span>
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate text-base text-fg">{name}</p>
        {year && <p className="text-xs text-fg-subtle tabular-nums">{year}</p>}
      </div>
      {!added && (
        <form onSubmit={submit} className="flex gap-1.5">
          <Input
            inputMode="decimal"
            placeholder="Hours"
            aria-label={`Hours played in ${name}`}
            aria-invalid={invalid || undefined}
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            className="min-w-0 flex-1 tabular-nums"
          />
          <Button
            type="submit"
            variant="secondary"
            size="icon"
            loading={pending}
            disabled={invalid || disabled}
            aria-label={`Add ${name}`}
          >
            <Plus size={14} strokeWidth={1.75} aria-hidden />
          </Button>
        </form>
      )}
    </li>
  );
}
