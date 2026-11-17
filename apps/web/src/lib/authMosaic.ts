/** Auth backdrop: a fixed set of public IGDB cover ids, so the screens need no session or API call. */
export const AUTH_COVER_IDS = [
  'co1wyy',
  'co1r7h',
  'co39vc',
  'co2lbd',
  'co3p2d',
  'co1tmu',
  'co4jni',
  'co20tg',
  'co2ekt',
  'co1x7d',
  'co1yqj',
  'co2r6g',
] as const;

export const igdbCoverUrl = (id: string, size: 't_cover_big' | 't_cover_small') =>
  `https://images.igdb.com/igdb/image/upload/${size}/${id}.jpg`;

/** Deals ids round-robin into `columns` columns of `perColumn` tiles each (ids repeat to fill). */
export function mosaicColumns(
  ids: readonly string[],
  columns: number,
  perColumn: number,
): string[][] {
  return Array.from({ length: columns }, (_, col) =>
    ids.length === 0
      ? []
      : Array.from(
          { length: perColumn },
          (_, row) => ids[(row * columns + col) % ids.length] as string,
        ),
  );
}
