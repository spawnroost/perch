import { useRef, useState, type ChangeEvent } from 'react';
import { FileUp } from 'lucide-react';
import { parseLibraryExport, type ParsedExport } from '@perch/core/browser';
import { Button, Notice } from '../atoms';
import { useImportExportGames } from '@/hooks/queries';
import { foundSummary, importResultSummary, readExportFiles } from '@/lib/exportImport';

/** Pick Heroic or Playnite export files, see what was found, then import them in one go. */
export function ExportImport({ onDone }: { onDone: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedExport | null>(null);
  const importer = useImportExportGames();
  const result = importer.data;

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])];
    e.target.value = '';
    if (files.length === 0) return;
    importer.reset();
    try {
      setParsed(parseLibraryExport(await readExportFiles(files)));
    } catch {
      setParsed({ games: [], errors: ['Could not read those files.'] });
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={input}
        type="file"
        multiple
        accept=".json,.csv,.txt,application/json,text/csv"
        className="sr-only"
        tabIndex={-1}
        aria-label="Epic or GOG export files"
        onChange={onPick}
      />
      {!result && (
        <>
          <Button
            variant="secondary"
            className="w-full sm:w-fit"
            onClick={() => input.current?.click()}
          >
            <FileUp size={14} strokeWidth={1.75} aria-hidden />
            {parsed ? 'Choose other files' : 'Choose files'}
          </Button>
          <ul className="flex flex-col gap-1.5 text-xs text-fg-subtle">
            <li>
              Heroic: <code>~/.config/heroic/store_cache/legendary_library.json</code> and{' '}
              <code>gog_library.json</code>, plus <code>~/.config/heroic/store/timestamp.json</code>{' '}
              for playtime. On Windows use <code>%APPDATA%\heroic\</code>.
            </li>
            <li>Playnite: export a CSV with the Library Exporter extension.</li>
            <li>
              Any CSV works if it has a name column. Source and playtime columns are optional.
            </li>
          </ul>
        </>
      )}
      {parsed && !result && (
        <>
          <p className="text-sm text-fg tabular-nums">{foundSummary(parsed.games)}</p>
          {parsed.errors.length > 0 && (
            <Notice tone="error">
              <ul className="flex flex-col gap-1">
                {parsed.errors.map((err) => (
                  <li key={err}>{err}</li>
                ))}
              </ul>
            </Notice>
          )}
          {importer.error && <Notice tone="error">{importer.error.message}</Notice>}
          {parsed.games.length > 0 && (
            <Button
              variant="primary"
              className="w-full sm:w-fit"
              loading={importer.isPending}
              onClick={() => importer.mutate(parsed.games)}
            >
              Import {parsed.games.length}
            </Button>
          )}
        </>
      )}
      {result && (
        <>
          <Notice tone="success">{importResultSummary(result)}</Notice>
          {result.unmatchedCount > 0 && (
            <details className="text-sm text-fg-muted">
              <summary className="cursor-pointer">Not matched ({result.unmatchedCount})</summary>
              <ul className="mt-1 flex flex-col gap-0.5">
                {result.unmatched.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
              {result.unmatchedCount > result.unmatched.length && (
                <p className="mt-1 text-xs text-fg-subtle">
                  And {result.unmatchedCount - result.unmatched.length} more.
                </p>
              )}
            </details>
          )}
          <Button variant="secondary" className="w-fit" onClick={onDone}>
            Done
          </Button>
        </>
      )}
    </div>
  );
}
