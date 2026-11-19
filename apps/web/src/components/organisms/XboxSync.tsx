import { Button, Notice } from '../atoms';
import { ActionForm, FormField, UnmatchedTitles } from '../molecules';
import { useLinkXbox, useSyncXbox, useUnlinkXbox } from '@/hooks/queries';
import { importResultSummary } from '@/lib/exportImport';
import { syncedAgo } from '@/lib/steamSync';
import { xboxErrorText } from '@/lib/xboxSync';

/**
 * Xbox import: a gamertag form until linked, then sync / unlink with the last result.
 * The title history is read from Xbox Live, so the profile's game history must be public.
 */
export function XboxSync({
  gamertag,
  syncedAt,
}: {
  gamertag: string | null;
  syncedAt: string | null;
}) {
  const link = useLinkXbox();
  const sync = useSyncXbox();
  const unlink = useUnlinkXbox();
  const last = sync.data ?? link.data;
  const error = sync.error ?? link.error ?? unlink.error;

  return (
    <div className="flex flex-col gap-3">
      {gamertag ? (
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
            Sync Xbox library
          </Button>
          <span className="text-sm text-fg-muted">
            {gamertag} · {syncedAgo(syncedAt, new Date())}
          </span>
        </div>
      ) : (
        <ActionForm
          submitLabel="Link and import"
          pending={link.isPending}
          error={null}
          onSubmit={(data) => {
            sync.reset();
            link.mutate(String(data.get('gamertag') ?? '').trim());
          }}
        >
          <FormField
            label="Xbox gamertag"
            name="gamertag"
            autoComplete="off"
            maxLength={40}
            required
            hint="Your Xbox game history must be public (Privacy & online safety)."
          />
        </ActionForm>
      )}
      {last && (
        <>
          <Notice tone="success">{importResultSummary(last)}</Notice>
          <UnmatchedTitles titles={last.unmatched} count={last.unmatchedCount} />
        </>
      )}
      {error && <Notice tone="error">{xboxErrorText(error)}</Notice>}
      {gamertag && (
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
          Unlink Xbox
        </Button>
      )}
    </div>
  );
}
