/** How a route sits on the page: edge-to-edge with a gutter, a centred wide column, or a narrow column. */
export type LayoutKind = 'edge' | 'wide' | 'narrow';

export function layoutKind(pathname: string): LayoutKind {
  if (pathname === '/' || /^\/games\/[^/]+\/?$/.test(pathname)) return 'edge';
  if (/^\/(library|devices)\/?$/.test(pathname)) return 'wide';
  return 'narrow';
}
