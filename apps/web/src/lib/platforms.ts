import { IGDB_PLATFORM } from '@perch/core/presets';

/** Display names, one per platform core knows (the type forces a name for each new one). */
const NAMES: Record<keyof typeof IGDB_PLATFORM, string> = {
  linux: 'Linux',
  windows: 'Windows',
  mac: 'Mac',
  ps4: 'PlayStation 4',
  xboxOne: 'Xbox One',
  switch: 'Switch',
  ps5: 'PlayStation 5',
  xboxSeries: 'Xbox Series X|S',
  switch2: 'Switch 2',
  ios: 'iOS',
  android: 'Android',
};

const PLATFORM_NAMES = new Map<number, string>(
  (Object.keys(IGDB_PLATFORM) as (keyof typeof IGDB_PLATFORM)[]).map((key) => [
    IGDB_PLATFORM[key],
    NAMES[key],
  ]),
);

/** Names for the known platform ids, in order; unknown ids are left out. */
export function platformNames(ids: readonly number[]): string[] {
  return ids.flatMap((id) => PLATFORM_NAMES.get(id) ?? []);
}
