/** Routes whose page owns its width (hero art runs edge to edge); others sit in the narrow column. */
export function isFullBleedPath(pathname: string): boolean {
  return pathname === '/' || /^\/games\/[^/]+\/?$/.test(pathname);
}
