import { useId, type SVGProps } from 'react';

/** Perch mark: a play-triangle bird on a branch. One colour (currentColor); the eye is cut out. */
export function Logo({ title = 'Perch', ...props }: SVGProps<SVGSVGElement> & { title?: string }) {
  const mask = useId();
  return (
    <svg viewBox="0 0 120 120" fill="currentColor" stroke="currentColor" role="img" {...props}>
      <title>{title}</title>
      <mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width="120" height="120">
        <rect width="120" height="120" fill="#fff" stroke="none" />
        <circle cx="62" cy="50" r="5.5" fill="#000" stroke="none" />
      </mask>
      <g mask={`url(#${mask})`} strokeLinejoin="round" strokeLinecap="round">
        <path d="M40 62L12 94L22 98L48 82Z" strokeWidth="6" />
        <path d="M36 30Q66 40 94 58Q72 92 36 88Q42 59 36 30Z" strokeWidth="8" />
        <path d="M54 92v10M68 89v13" strokeWidth="5" fill="none" />
      </g>
      <path d="M12 104H108M88 104l10-9" strokeWidth="6" strokeLinecap="round" fill="none" />
    </svg>
  );
}
