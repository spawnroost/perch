import { RateQueue } from '../igdb/queue.js';
import { pickAlbum, toSoundtrack, type ItunesAlbum, type ItunesRow } from './match.js';
import type { Soundtrack } from './schemas.js';

const ITUNES = 'https://itunes.apple.com';

export interface ItunesClientOptions {
  fetch?: typeof fetch;
  /** iTunes allows roughly 20 requests a minute. */
  maxPerSecond?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export interface ItunesClient {
  /** The game's soundtrack album with its first tracks; null when no confident match. Throws on HTTP failure. */
  findSoundtrack(gameName: string): Promise<Soundtrack | null>;
}

export function createItunesClient(opts: ItunesClientOptions = {}): ItunesClient {
  const doFetch = opts.fetch ?? fetch;
  const queue = new RateQueue(opts.maxPerSecond ?? 1 / 3, { now: opts.now, sleep: opts.sleep });

  async function getResults<T>(path: string, params: Record<string, string>): Promise<T[]> {
    const url = `${ITUNES}/${path}?${new URLSearchParams(params)}`;
    const res = await queue.schedule(() => doFetch(url, { signal: AbortSignal.timeout(10_000) }));
    if (!res.ok) throw new Error(`iTunes ${path} answered ${res.status}`);
    const body = (await res.json()) as { results?: T[] };
    return Array.isArray(body.results) ? body.results : [];
  }

  return {
    async findSoundtrack(gameName) {
      const albums = await getResults<ItunesAlbum>('search', {
        term: `${gameName} soundtrack`,
        media: 'music',
        entity: 'album',
        limit: '10',
      });
      const album = pickAlbum(gameName, albums);
      if (!album) return null;
      const rows = await getResults<ItunesRow>('lookup', {
        id: String(album.collectionId),
        entity: 'song',
      });
      return toSoundtrack(album, rows);
    },
  };
}

let shared: ItunesClient | undefined;
/** One client per process, so every caller shares the rate queue. */
export function getSharedItunesClient(): ItunesClient {
  return (shared ??= createItunesClient());
}
