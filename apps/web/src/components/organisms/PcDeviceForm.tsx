import { useId, useState, type FormEvent } from 'react';
import { Button, Notice } from '../atoms';
import { FormField } from '../molecules';
import { useHardwareSuggestions } from '@/hooks/queries';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { readDeviceMemory, readWebglRenderer } from '@/lib/gpuHint';

function HardwareField({
  kind,
  label,
  value,
  onChange,
  hint,
}: {
  kind: 'gpus' | 'cpus';
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
}) {
  const listId = useId();
  const suggestions = useHardwareSuggestions(kind, useDebouncedValue(value.trim()));
  return (
    <>
      <FormField
        label={label}
        name={kind}
        list={listId}
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        hint={hint}
        required
      />
      <datalist id={listId}>
        {suggestions.data?.map((s) => (
          <option key={s.key} value={s.key} />
        ))}
      </datalist>
    </>
  );
}

export interface PcValues {
  gpu: string;
  cpu: string;
  ramGb: number;
}

export function PcDeviceForm({
  initial,
  submitLabel,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  /** Editing an existing PC: fields start from it and browser hints are not used. */
  initial?: { gpu: string | null; cpu: string | null; ramGb: number | null };
  submitLabel: string;
  pending: boolean;
  error: string | null;
  onSubmit: (values: PcValues) => void;
  onCancel: () => void;
}) {
  // Browser hints are read once on mount; the user confirms or edits them.
  const [gpuHint] = useState(() => (initial ? null : readWebglRenderer()));
  const [memory] = useState(() => (initial ? null : readDeviceMemory()));
  const [gpu, setGpu] = useState(initial?.gpu ?? gpuHint ?? '');
  const [cpu, setCpu] = useState(initial?.cpu ?? '');
  const [ram, setRam] = useState(
    initial?.ramGb ? String(initial.ramGb) : memory ? String(memory.gb) : '',
  );

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit({ gpu: gpu.trim(), cpu: cpu.trim(), ramGb: Number(ram) });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-lg border border-line bg-surface-1 p-4"
    >
      <HardwareField
        kind="gpus"
        label="Graphics card"
        value={gpu}
        onChange={setGpu}
        hint={gpuHint ? `Detected from your browser: ${gpuHint}. Check it is right.` : undefined}
      />
      <HardwareField kind="cpus" label="Processor" value={cpu} onChange={setCpu} />
      <FormField
        label="Memory (GB)"
        name="ram"
        type="number"
        inputMode="decimal"
        min={1}
        step="any"
        value={ram}
        onChange={(e) => setRam(e.target.value)}
        hint={
          memory?.atLeast
            ? 'Your browser reports 8 or more GB, and caps the value at 8. Enter the real amount.'
            : undefined
        }
        required
      />
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" loading={pending}>
          {submitLabel}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
