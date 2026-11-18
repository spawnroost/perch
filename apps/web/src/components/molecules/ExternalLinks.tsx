import { ExternalLink } from 'lucide-react';

/** Quiet text links (reviews, discussion) that open externally. */
export function ExternalLinks({ links }: { links: ReadonlyArray<{ label: string; url: string }> }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1">
      {links.map((l) => (
        <li key={l.url}>
          <a
            href={l.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-sm text-sm text-fg-muted underline-offset-4 hover:text-fg hover:underline"
          >
            {l.label}
            <ExternalLink size={12} strokeWidth={1.75} aria-hidden />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
