import type { UseMutationResult } from '@tanstack/react-query';
import type { ExportImportResult } from '@perch/core/browser';
import { Button, Notice } from '../atoms';
import { ActionForm, FormField, UnmatchedTitles } from '../molecules';
import { importResultSummary } from '@/lib/exportImport';
import { syncedAgo } from '@/lib/steamSync';

/**
 * Import from a store that is linked by a public handle (Xbox gamertag, PlayStation online ID):
 * a handle form until linked, then sync / unlink with the last result.
 */
export function LinkedAccountSync({
  store,
  handleLabel,
  handleName,
  hint,
  handle,
  syncedAt,
  link,
  sync,
  unlink,
  errorText,
}: {
  /** "Xbox", "PlayStation": used in button labels. */
  store: string;
  handleLabel: string;
  handleName: string;
  hint: string;
  handle: string | null;
  syncedAt: string | null;
  link: UseMutationResult<ExportImportResult, Error, string>;
  sync: UseMutationResult<ExportImportResult, Error, void>;
  unlink: UseMutationResult<unknown, Error, void>;
  errorText: (err: unknown) => string;
}) {
  const last = sync.data ?? link.data;
  const error = sync.error ?? link.error ?? unlink.error;

  return (
    <div className="flex flex-col gap-3">
      {handle ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="primary"
            className="w-fit"
            loading={sync.isPending}
            onClick={() => {
              link.reset();
              sync.mutate();
            }}
          >
            Sync {store} library
          </Button>
          <span className="text-sm text-fg-muted">
            {handle} · {syncedAgo(syncedAt, new Date())}
          </span>
        </div>
      ) : (
        <ActionForm
          submitLabel="Link and import"
          pending={link.isPending}
          error={null}
          onSubmit={(data) => {
            sync.reset();
            link.mutate(String(data.get(handleName) ?? '').trim());
          }}
        >
          <FormField
            label={handleLabel}
            name={handleName}
            autoComplete="off"
            maxLength={40}
            required
            hint={hint}
          />
        </ActionForm>
      )}
      {last && (
        <>
          <Notice tone="success">{importResultSummary(last)}</Notice>
          <UnmatchedTitles titles={last.unmatched} count={last.unmatchedCount} />
        </>
      )}
      {error && <Notice tone="error">{errorText(error)}</Notice>}
      {handle && (
        <Button
          variant="secondary"
          className="w-fit"
          loading={unlink.isPending}
          onClick={() => {
            sync.reset();
            link.reset();
            unlink.mutate();
          }}
        >
          Unlink {store}
        </Button>
      )}
    </div>
  );
}
