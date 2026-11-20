import { deepseekChat, type DeepseekChatOptions } from './chat.js';
import {
  REASON_HARD_MAX_CHARS,
  REASON_MAX_CHARS,
  reasonEntrySchema,
  reasonsResponseSchema,
  type ReasonExplainer,
  type ReasonItem,
} from './schemas.js';

export type DeepseekExplainerOptions = DeepseekChatOptions;

const SYSTEM_PROMPT = `You write one-line reasons why a video game fits a player's taste.
For each game you get its title, the player's library games it is closest to, and taste tags they share.
Rules for every reason:
- friendly and specific, second person ("you")
- at most ${REASON_MAX_CHARS} characters
- no hype words (amazing, incredible, masterpiece, must-play, and the like)
- no spoilers
- when a library game is given, mention it by name
- use only the facts given plus common knowledge of the game; do not invent details
Answer with JSON only: {"reasons":[{"id":<id>,"text":"<reason>"}]} with one entry per game, using the ids you were given.`;

/** Trims 141-160 char text to 140 at a word boundary; null when empty or longer than 160. */
export function cleanReason(raw: string): string | null {
  const text = raw.trim().replace(/\s+/g, ' ');
  if (!text || text.length > REASON_HARD_MAX_CHARS) return null;
  if (text.length <= REASON_MAX_CHARS) return text;
  const head = text.slice(0, REASON_MAX_CHARS + 1);
  const cut = head.lastIndexOf(' ');
  const trimmed = (cut > 0 ? head.slice(0, cut) : text.slice(0, REASON_MAX_CHARS))
    .replace(/[\s,;:\-–]+$/, '')
    .trim();
  return trimmed || null;
}

/** DeepSeek via its OpenAI-compatible chat completions endpoint, in JSON mode; one call per batch. */
export function createDeepseekExplainer(o: DeepseekExplainerOptions): ReasonExplainer {
  return {
    name: 'deepseek',
    async explain(items: readonly ReasonItem[]) {
      const out = new Map<number, string>();
      if (items.length === 0) return out;
      // Titles and tag labels only: no user id, email or anything else about the player.
      const payload = items.map((i) => ({
        id: i.igdbId,
        game: i.name,
        closestLibraryGames: i.closestLibraryGames,
        sharedTags: i.sharedTags,
        ...(i.fit ? { fit: i.fit } : {}),
      }));
      const content = await deepseekChat(o, {
        system: SYSTEM_PROMPT,
        user: { games: payload },
        maxTokens: 2000,
        temperature: 0.4,
      });
      const { reasons } = reasonsResponseSchema.parse(JSON.parse(content));
      const asked = new Set(items.map((i) => i.igdbId));
      for (const entry of reasons) {
        const parsed = reasonEntrySchema.safeParse(entry);
        if (!parsed.success || !asked.has(parsed.data.id) || out.has(parsed.data.id)) continue;
        const text = cleanReason(parsed.data.text);
        if (text) out.set(parsed.data.id, text);
      }
      return out;
    },
  };
}
