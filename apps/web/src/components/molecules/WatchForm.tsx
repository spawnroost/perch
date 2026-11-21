import { useState } from 'react';
import { Button, Input, Label, Notice } from '../atoms';
import { parseTargetPrice, targetInputValue } from '@/lib/watch';

export interface WatchFormProps {
  /** The stored target; null = any sale. */
  initialTarget: number | null;
  pending: boolean;
  /** A failed save, shown under the field. */
  error?: string | null;
  onSave: (targetPrice: number | null) => void;
  onCancel: () => void;
}

/** Target-price field for a price watch: a dollar amount, or empty to hear about any sale. */
export function WatchForm({ initialTarget, pending, error, onSave, onCancel }: WatchFormProps) {
  const [text, setText] = useState(targetInputValue(initialTarget));
  const [invalid, setInvalid] = useState<string | null>(null);
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const parsed = parseTargetPrice(text);
        if (!parsed.ok) return setInvalid(parsed.error);
        setInvalid(null);
        onSave(parsed.value);
      }}
    >
      <Label htmlFor="watch-target">Alert me at or below (USD)</Label>
      <Input
        id="watch-target"
        inputMode="decimal"
        autoComplete="off"
        placeholder="Any sale"
        value={text}
        aria-invalid={invalid ? true : undefined}
        onChange={(e) => setText(e.target.value)}
      />
      {invalid || error ? <Notice tone="error">{invalid ?? error}</Notice> : null}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" size="sm" loading={pending}>
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
