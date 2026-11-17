import { useState } from 'react';
import type { LibraryEntry } from '@perch/core';
import { Button, Notice } from '../atoms';
import { ActionForm, FormField, SelectField } from '../molecules';
import { useRemoveLibraryEntry, useUpdateLibraryEntry } from '@/hooks/queries';
import { buildPatch, STATUS_LABEL, STATUSES, toForm, type Status } from '@/lib/library';

/** Edit hours, last played and status of one library entry, or remove it. */
export function LibraryEntryEditor({ entry, onDone }: { entry: LibraryEntry; onDone: () => void }) {
  const update = useUpdateLibraryEntry();
  const remove = useRemoveLibraryEntry();
  const [formError, setFormError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const form = toForm(entry);
  const busy = update.isPending || remove.isPending;

  function onSubmit(data: FormData) {
    const result = buildPatch(entry, {
      hours: String(data.get('hours') ?? ''),
      lastPlayed: String(data.get('lastPlayed') ?? ''),
      status: String(data.get('status')) as Status,
    });
    if (!result.ok) return setFormError(result.error);
    setFormError(null);
    if (!result.patch) return onDone();
    update.mutate({ id: entry.id, patch: result.patch }, { onSuccess: onDone });
  }

  return (
    <ActionForm
      onSubmit={onSubmit}
      submitLabel="Save"
      pending={update.isPending}
      disabled={busy}
      error={formError ?? update.error?.message ?? null}
      after={
        confirming ? (
          <div className="flex flex-col gap-2">
            {remove.error && <Notice tone="error">{remove.error.message}</Notice>}
            <div className="flex gap-2">
              <Button
                variant="danger"
                loading={remove.isPending}
                disabled={busy}
                onClick={() => remove.mutate(entry.id, { onSuccess: onDone })}
              >
                Remove {entry.name}
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => setConfirming(false)}>
                Keep
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="ghost" disabled={busy} onClick={() => setConfirming(true)}>
            Remove from library
          </Button>
        )
      }
    >
      <FormField
        label="Hours played"
        name="hours"
        inputMode="decimal"
        defaultValue={form.hours}
        placeholder="Optional"
      />
      <FormField label="Last played" name="lastPlayed" type="date" defaultValue={form.lastPlayed} />
      <SelectField label="Status" name="status" defaultValue={form.status}>
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABEL[s]}
          </option>
        ))}
      </SelectField>
    </ActionForm>
  );
}
