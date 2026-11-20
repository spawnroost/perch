import { SOUNDTRACK_MAX_TRACKS, type Soundtrack, type SoundtrackLinks } from './schemas.js';

/** The album fields of an iTunes search result that matching reads. */
export interface ItunesAlbum {
  collectionId: number;
  collectionName: string;
  artistName: string;
  collectionType?: string;
  trackCount?: number;
  artworkUrl100?: string;
  collectionViewUrl?: string;
}

/** A row of an iTunes lookup (the album itself comes first, then its songs). */
export interface ItunesRow {
  wrapperType?: string;
  trackName?: string;
  trackNumber?: number;
  discNumber?: number;
  trackTimeMillis?: number;
  previewUrl?: string;
}

/** Lower-case words: marks, apostrophes and punctuation removed. */
export function normalizeTitle(s: string): string {
  return s
    .replace(/[®™©'’]/g, '') // before NFKD, which would turn ™ into "TM"
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Words an album title may carry besides the game name; anything else means another work. */
const FILLER = new Set([
  'original',
  'game',
  'video',
  'soundtrack',
  'ost',
  'score',
  'music',
  'from',
  'the',
  'of',
  'a',
  'deluxe',
  'edition',
  'expanded',
  'remastered',
  'remaster',
  'official',
  'complete',
  'bonus',
  'vol',
  'volume',
  'and',
]);
const YEAR = /^(19[7-9]\d|20\d\d)$/;

function hasKeyword(words: string[]): boolean {
  const has = (w: string) => words.includes(w);
  const pair = (a: string, b: string) => words.some((w, i) => w === a && words[i + 1] === b);
  return has('soundtrack') || has('ost') || pair('original', 'score') || pair('music', 'from');
}

/** Index of `needle` as a run of whole words in `words`, or -1. */
function indexOfRun(words: string[], needle: string[]): number {
  for (let i = 0; i + needle.length <= words.length; i++) {
    if (needle.every((n, j) => words[i + j] === n)) return i;
  }
  return -1;
}

function isGameAlbum(gameWords: string[], a: ItunesAlbum): boolean {
  if (a.collectionType && a.collectionType !== 'Album') return false;
  if (/^various/i.test(a.artistName)) return false;
  const words = normalizeTitle(a.collectionName).split(' ');
  if (!hasKeyword(words)) return false;
  const at = indexOfRun(words, gameWords);
  if (at < 0) return false;
  const rest = [...words.slice(0, at), ...words.slice(at + gameWords.length)];
  return rest.every((w) => FILLER.has(w) || YEAR.test(w));
}

/**
 * The game's soundtrack album among search results, or null when unsure. The title must be the
 * game's name plus only soundtrack filler (so "Doom" skips "Doom Eternal", tributes, covers,
 * remixes and film scores); the album with most tracks wins.
 */
export function pickAlbum(gameName: string, albums: ItunesAlbum[]): ItunesAlbum | null {
  // A trailing "(2016)" on the game name is not part of how albums are titled.
  const gameWords = normalizeTitle(gameName.replace(/\(\s*\d{4}\s*\)\s*$/, '')).split(' ');
  if (gameWords[0] === '') return null;
  let best: ItunesAlbum | null = null;
  for (const a of albums) {
    if (!isGameAlbum(gameWords, a)) continue;
    if (!best || (a.trackCount ?? 0) > (best.trackCount ?? 0)) best = a;
  }
  return best;
}

/** iTunes artwork urls carry their size; ask for 600x600. */
export function upscaleArtwork(url: string | undefined): string | null {
  if (!url) return null;
  return url.replace(/\/\d+x\d+(bb)?\.(jpg|png)$/, '/600x600$1.$2');
}

/** Builds the stored payload from the matched album and its lookup rows; null when unusable. */
export function toSoundtrack(album: ItunesAlbum, rows: ItunesRow[]): Soundtrack | null {
  if (!album.collectionViewUrl) return null;
  const tracks = rows
    .filter((r) => r.wrapperType === 'track' && r.trackName && Number.isInteger(r.trackNumber))
    .map((r) => ({
      name: r.trackName!,
      disc: Number.isInteger(r.discNumber) && r.discNumber! > 0 ? r.discNumber! : 1,
      number: r.trackNumber!,
      durationMs: typeof r.trackTimeMillis === 'number' ? Math.round(r.trackTimeMillis) : null,
      previewUrl: r.previewUrl ?? null,
    }))
    .sort((a, b) => a.disc - b.disc || a.number - b.number)
    .slice(0, SOUNDTRACK_MAX_TRACKS);
  if (tracks.length === 0) return null;
  return {
    albumName: album.collectionName,
    artist: album.artistName,
    artworkUrl: upscaleArtwork(album.artworkUrl100),
    appleMusicUrl: album.collectionViewUrl,
    tracks,
  };
}

/** Search links for the game's soundtrack; Apple Music uses the matched album when there is one. */
export function soundtrackLinks(gameName: string, appleMusicUrl: string | null): SoundtrackLinks {
  const q = encodeURIComponent(`${gameName} soundtrack`);
  return {
    spotify: `https://open.spotify.com/search/${q}`,
    youtube: `https://www.youtube.com/results?search_query=${q}`,
    appleMusic: appleMusicUrl ?? `https://music.apple.com/search?term=${q}`,
  };
}
