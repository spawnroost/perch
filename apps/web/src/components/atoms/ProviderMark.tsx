import type { AuthProviderId } from '@perch/core';

const MARKS: Record<AuthProviderId, string> = { google: 'G', discord: 'D', steam: 'S' };

/** Plain monogram for a sign-in provider; no official logos. Decorative. */
export function ProviderMark({ provider }: { provider: AuthProviderId }) {
  return (
    <svg viewBox="0 0 16 16" className="size-4 shrink-0" aria-hidden>
      <rect width="16" height="16" rx="4" className="fill-surface-3" />
      <text
        x="8"
        y="11.5"
        textAnchor="middle"
        fontSize="10"
        fontWeight="700"
        className="fill-current"
      >
        {MARKS[provider]}
      </text>
    </svg>
  );
}
