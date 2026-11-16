import { useId, useState, type FormEvent } from 'react';
import { Button, Notice } from '../atoms';
import { FormField } from '../molecules';
import { useAddDevice, useHardwareSuggestions } from '@/hooks/queries';
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

export function PcDeviceForm({
  add,
  onDone,
  onCancel,
}: {
  /** Shared with DevicesStep so presets disable while a PC is being added. */
  add: ReturnType<typeof useAddDevice>;
  onDone: () => void;
  onCancel: () => void;
}) {
  // Browser hints are read once on mount; the user confirms or edits them.
  const [gpuHint] = useState(readWebglRenderer);
  const [memory] = useState(readDeviceMemory);
  const [gpu, setGpu] = useState(gpuHint ?? '');
  const [cpu, setCpu] = useState('');
  const [ram, setRam] = useState(memory ? String(memory.gb) : '');

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    add.mutate(
      { pc: { gpu: gpu.trim(), cpu: cpu.trim(), ramGb: Number(ram) } },
      { onSuccess: onDone },
    );
  }

  return (
    <form
      onSubmit={onSubmit}
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
      {add.error && <Notice tone="error">{add.error.message}</Notice>}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" loading={add.isPending}>
          Add PC
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
