/** Public IGDB image url for an image id at a size such as t_cover_big or t_cover_small. */
export const imageUrl = (size: string, imageId: string): string =>
  `https://images.igdb.com/igdb/image/upload/${size}/${imageId}.jpg`;
