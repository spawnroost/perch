import { z } from 'zod';

/** Top picks of the For-you feed that get an LLM reason. */
export const REASON_TOP_N = 20;
/** Reasons longer than this are trimmed (down to REASON_MAX_CHARS) or dropped. */
export const REASON_MAX_CHARS = 140;
export const REASON_HARD_MAX_CHARS = 160;

/** What is sent to the model about one pick: game titles and tag labels only. */
export const reasonItemSchema = z.object({
  igdbId: z.number().int(),
  name: z.string(),
  /** Names of the user's library games closest to this pick (at most 3). */
  closestLibraryGames: z.array(z.string()).max(3),
  /** Taste tags shared with those games (at most 3). */
  sharedTags: z.array(z.string()).max(3),
  /** Optional hint on how the game fits the user's devices. */
  fit: z.string().optional(),
});
export type ReasonItem = z.infer<typeof reasonItemSchema>;

/** The model's JSON answer; items are validated one by one so a bad one drops alone. */
export const reasonsResponseSchema = z.object({ reasons: z.array(z.unknown()) });
export const reasonEntrySchema = z.object({ id: z.number().int(), text: z.string() });

/** Turns a batch of picks into one short reason each; picks it cannot explain are left out. */
export interface ReasonExplainer {
  readonly name: string;
  explain(items: readonly ReasonItem[]): Promise<Map<number, string>>;
}
