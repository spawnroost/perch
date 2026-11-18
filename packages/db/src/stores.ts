// Plain constants/types, kept import-free so browser code can use them via '@perch/db/stores'.
export const STORE_IDS = [
  'steam',
  'gog',
  'epic',
  'playstation',
  'xbox',
  'nintendo',
  'app-store',
  'google-play',
  'itch',
] as const;
export type StoreId = (typeof STORE_IDS)[number];
export interface StoreLink {
  store: StoreId;
  url: string;
}
