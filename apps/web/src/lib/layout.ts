/** Routes whose page owns its width (hero art and card grids run wide); others sit in the narrow column. */
export function isFullBleedPath(pathname: string): boolean {
  return pathname === '/' || /^\/(games\/[^/]+|library|devices)\/?$/.test(pathname);
}
