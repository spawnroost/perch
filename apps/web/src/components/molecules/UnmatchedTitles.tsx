/** Collapsed list of titles an import could not match; `count` can exceed what is listed. */
export function UnmatchedTitles({ titles, count }: { titles: readonly string[]; count: number }) {
  if (count === 0) return null;
  return (
    <details className="text-sm text-fg-muted">
      <summary className="cursor-pointer">Not matched ({count})</summary>
      <ul className="mt-1 flex flex-col gap-0.5">
        {titles.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      {count > titles.length && (
        <p className="mt-1 text-xs text-fg-subtle">And {count - titles.length} more.</p>
      )}
    </details>
  );
}
