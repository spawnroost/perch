/** Drops trademark signs and tidies spaces. The first step of every store's title cleaner. */
export function stripTrademarks(raw: string): string {
  return raw.replace(/[®™©]/g, '').replace(/\s+/g, ' ').trim();
}
