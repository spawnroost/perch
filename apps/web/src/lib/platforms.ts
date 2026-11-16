/** Display names for the IGDB platform ids Perch knows (mirrors `IGDB_PLATFORM` in core). */
const PLATFORM_NAMES: Record<number, string> = {
  3: 'Linux',
  6: 'Windows',
  14: 'Mac',
  48: 'PlayStation 4',
  49: 'Xbox One',
  130: 'Switch',
  167: 'PlayStation 5',
  169: 'Xbox Series X|S',
  508: 'Switch 2',
};

/** Names for the known platform ids, in order; unknown ids are left out. */
export function platformNames(ids: readonly number[]): string[] {
  return ids.flatMap((id) => PLATFORM_NAMES[id] ?? []);
}
