import { describe, expect, it } from 'vitest';
import {
  normalizeTitle,
  pickAlbum,
  soundtrackLinks,
  toSoundtrack,
  upscaleArtwork,
  type ItunesAlbum,
} from '../../src/soundtrack/match.js';

const album = (over: Partial<ItunesAlbum> & { collectionName: string }): ItunesAlbum => ({
  collectionId: 1,
  artistName: 'Composer',
  collectionType: 'Album',
  trackCount: 20,
  ...over,
});

describe('normalizeTitle', () => {
  it('strips marks, case and punctuation', () => {
    expect(normalizeTitle('DOOM® (Original Game Soundtrack)™')).toBe(
      'doom original game soundtrack',
    );
    expect(normalizeTitle("Marvel's  Spider-Man ©")).toBe('marvels spider man');
  });
});

describe('pickAlbum', () => {
  it('picks the game soundtrack over a movie score with the same name', () => {
    const picked = pickAlbum('Doom', [
      album({
        collectionId: 1,
        collectionName: 'Doom (Original Motion Picture Soundtrack)',
        trackCount: 22,
      }),
      album({ collectionId: 2, collectionName: 'DOOM (Original Game Soundtrack)', trackCount: 31 }),
    ]);
    expect(picked?.collectionId).toBe(2);
  });

  it('does not match Doom Eternal for Doom', () => {
    expect(
      pickAlbum('Doom', [
        album({ collectionName: 'DOOM Eternal (Original Game Soundtrack)', trackCount: 40 }),
      ]),
    ).toBeNull();
  });

  it('matches Doom Eternal for Doom Eternal', () => {
    expect(
      pickAlbum('DOOM Eternal', [
        album({ collectionId: 9, collectionName: 'DOOM Eternal (Original Game Soundtrack)' }),
      ])?.collectionId,
    ).toBe(9);
  });

  it('matches a remaster by the base title and takes the album with most tracks', () => {
    const picked = pickAlbum('Halo: The Master Chief Collection', [
      album({
        collectionId: 1,
        collectionName: 'Halo: The Master Chief Collection (Original Soundtrack)',
        trackCount: 10,
      }),
      album({
        collectionId: 2,
        collectionName: 'Halo: The Master Chief Collection (Original Soundtrack) [Deluxe]',
        trackCount: 30,
      }),
    ]);
    expect(picked?.collectionId).toBe(2);
  });

  it('rejects tribute, piano, lofi, karaoke, cover and remix albums', () => {
    for (const name of [
      'Doom Soundtrack Piano Tribute',
      'Doom Lofi Soundtrack',
      'Doom OST Karaoke',
      'Doom Soundtrack (Cover Version)',
      'Doom Soundtrack Remix',
    ]) {
      expect(pickAlbum('Doom', [album({ collectionName: name })])).toBeNull();
    }
  });

  it('allows a reject word when the game name itself contains it', () => {
    expect(
      pickAlbum('Piano Fantasy', [
        album({ collectionId: 5, collectionName: 'Piano Fantasy Original Soundtrack' }),
      ])?.collectionId,
    ).toBe(5);
  });

  it('rejects "Various Artists" compilations and non-albums', () => {
    expect(
      pickAlbum('Doom', [
        album({ collectionName: 'Doom Original Soundtrack', artistName: 'Various Artists' }),
        album({ collectionName: 'Doom Original Soundtrack', collectionType: 'Compilation' }),
      ]),
    ).toBeNull();
  });

  it('needs a soundtrack keyword', () => {
    expect(pickAlbum('Doom', [album({ collectionName: 'Doom Greatest Hits' })])).toBeNull();
    expect(
      pickAlbum('Hades', [album({ collectionId: 3, collectionName: 'Hades: Original Score' })])
        ?.collectionId,
    ).toBe(3);
    expect(
      pickAlbum('Journey', [album({ collectionId: 4, collectionName: 'Music from Journey' })])
        ?.collectionId,
    ).toBe(4);
    expect(
      pickAlbum('Celeste', [album({ collectionId: 6, collectionName: 'Celeste OST' })])
        ?.collectionId,
    ).toBe(6);
  });

  it('is null with no results', () => {
    expect(pickAlbum('Doom', [])).toBeNull();
  });
});

describe('upscaleArtwork', () => {
  it('rewrites the size segment to 600x600', () => {
    expect(upscaleArtwork('https://x/a/100x100bb.jpg')).toBe('https://x/a/600x600bb.jpg');
    expect(upscaleArtwork(undefined)).toBeNull();
  });
});

describe('toSoundtrack', () => {
  const a = album({
    collectionId: 7,
    collectionName: 'Doom OST',
    artworkUrl100: 'https://x/a/100x100bb.jpg',
    collectionViewUrl: 'https://music.apple.com/us/album/doom/7?uo=4',
  });
  const songs = Array.from({ length: 20 }, (_, i) => ({
    wrapperType: 'track',
    trackName: `T${i + 1}`,
    trackNumber: i + 1,
    trackTimeMillis: 1000,
    previewUrl: i === 1 ? undefined : `https://p/${i}.m4a`,
  }));

  it('builds the payload, caps tracks at 12, keeps order, skips non-track rows', () => {
    const s = toSoundtrack(a, [{ wrapperType: 'collection' }, ...songs.slice().reverse()]);
    expect(s).toMatchObject({
      albumName: 'Doom OST',
      artist: 'Composer',
      artworkUrl: 'https://x/a/600x600bb.jpg',
      appleMusicUrl: 'https://music.apple.com/us/album/doom/7?uo=4',
    });
    expect(s!.tracks).toHaveLength(12);
    expect(s!.tracks[0]).toEqual({
      name: 'T1',
      number: 1,
      durationMs: 1000,
      previewUrl: 'https://p/0.m4a',
    });
    expect(s!.tracks[1]!.previewUrl).toBeNull();
  });

  it('is null without tracks or an album url', () => {
    expect(toSoundtrack(a, [])).toBeNull();
    expect(toSoundtrack({ ...a, collectionViewUrl: undefined }, songs)).toBeNull();
  });
});

describe('soundtrackLinks', () => {
  it('builds search links and prefers the album url for Apple Music', () => {
    const l = soundtrackLinks('Doom & Co', null);
    expect(l.spotify).toBe('https://open.spotify.com/search/Doom%20%26%20Co%20soundtrack');
    expect(l.youtube).toBe(
      'https://www.youtube.com/results?search_query=Doom%20%26%20Co%20soundtrack',
    );
    expect(l.appleMusic).toBe('https://music.apple.com/search?term=Doom%20%26%20Co%20soundtrack');
    expect(soundtrackLinks('Doom', 'https://music.apple.com/x').appleMusic).toBe(
      'https://music.apple.com/x',
    );
  });
});
