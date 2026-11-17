import { useState } from 'react';
import { Button, Notice, Textarea } from '../atoms';
import { ImportRowItem } from '../molecules';
import { useImportConfirm, useImportPreview } from '@/hooks/queries';
import {
  canConfirm,
  confirmItems,
  initialRows,
  retryAfterImport,
  selectMatch,
  summarizeImport,
  unmatchedCount,
  type ImportRow,
} from '@/lib/importPreview';

/** Paste a list, review the matches, then import. */
export function ImportList({ onDone }: { onDone: () => void }) {
  const [text, setText] = useState('');
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [failures, setFailures] = useState<{ label: string; error: string }[]>([]);
  const [lineErrors, setLineErrors] = useState<{ line: number; error: string }[]>([]);
  const preview = useImportPreview();
  const confirm = useImportConfirm();

  function runPreview() {
    preview.mutate(text, {
      onSuccess: (res) => {
        setRows(initialRows(res.lines));
        setLineErrors(res.errors);
      },
    });
  }

  function runConfirm() {
    if (!rows) return;
    confirm.mutate(
      { items: confirmItems(rows) },
      {
        onSuccess: (res) => {
          const retry = retryAfterImport(text, rows, res.failed);
          setSummary(summarizeImport(res));
          setFailures(retry.failures);
          setRows(null);
          // Failed lines stay in the textarea so they can be retried.
          setText(retry.text);
        },
      },
    );
  }

  if (summary) {
    return (
      <div className="flex flex-col gap-3">
        <Notice tone={failures.length > 0 ? 'error' : 'success'}>{summary}</Notice>
        {failures.length > 0 && (
          <ul className="flex flex-col gap-1 text-sm text-fg-muted">
            {failures.map((f) => (
              <li key={f.label}>
                {f.label}: {f.error}
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          {failures.length > 0 && (
            <Button
              variant="primary"
              onClick={() => {
                setSummary(null);
                setFailures([]);
              }}
            >
              Retry failed
            </Button>
          )}
          <Button variant="secondary" onClick={onDone}>
            Done
          </Button>
        </div>
      </div>
    );
  }

  if (rows) {
    return (
      <div className="flex min-h-0 flex-col gap-3">
        <p className="text-sm text-fg-muted tabular-nums">
          {rows.length - unmatchedCount(rows)} of {rows.length} matched. Pick the right game for
          each line, or skip it.
        </p>
        {lineErrors.length > 0 && (
          <Notice tone="error">
            {lineErrors.map((e) => `Line ${e.line}: ${e.error}`).join(' ')}
          </Notice>
        )}
        {confirm.error && <Notice tone="error">{confirm.error.message}</Notice>}
        <ul className="overflow-y-auto rounded-lg border border-line bg-surface-1">
          {rows.map((r) => (
            <ImportRowItem
              key={r.line}
              row={r}
              onSelect={(id) => setRows((prev) => prev && selectMatch(prev, r.line, id))}
            />
          ))}
        </ul>
        <div className="flex gap-2">
          <Button
            variant="primary"
            disabled={!canConfirm(rows)}
            loading={confirm.isPending}
            onClick={runConfirm}
          >
            Import {confirmItems(rows).length}
          </Button>
          <Button variant="ghost" onClick={() => setRows(null)}>
            Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Textarea
        autoFocus
        aria-label="Games to import"
        placeholder={'Hades | 40 | 2026-02-01 | finished\nCeleste | 12'}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <p className="text-xs text-fg-subtle">
        One game per line: name | hours | last played (YYYY-MM-DD) | status. Only the name is
        required. Up to 100 lines.
      </p>
      {preview.error && <Notice tone="error">{preview.error.message}</Notice>}
      <Button
        variant="primary"
        disabled={!text.trim()}
        loading={preview.isPending}
        onClick={runPreview}
      >
        Preview
      </Button>
    </div>
  );
}
