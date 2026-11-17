/** How a route sits on the page: edge-to-edge with a gutter, or a narrow column. The nav is always edge. */
export type LayoutKind = 'edge' | 'narrow';

export function layoutKind(pathname: string): LayoutKind {
  if (pathname === '/' || /^\/(games\/[^/]+|for-you\/[^/]+|library|devices)\/?$/.test(pathname))
    return 'edge';
  return 'narrow';
}
