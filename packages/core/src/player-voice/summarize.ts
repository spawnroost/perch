import { z } from 'zod';
import { deepseekChat, type DeepseekChatOptions } from '../explain/chat.js';
import {
  VOICE_MAX_CHARS,
  VOICE_MAX_POINTS,
  type PlayerVoice,
  type VoiceReview,
  type VoiceSummarizer,
} from './schemas.js';

const answerSchema = z.object({
  likes: z.array(z.string()),
  complaints: z.array(z.string()),
  deck: z.string().nullish(),
});

const SYSTEM_PROMPT = `You summarize what players say in Steam reviews of one video game.
You get the game's title and a list of reviews: {"up": true if the player recommends it, "hours": hours played when they wrote it, "deck": true if written mainly on a Steam Deck, "text": the review}.
Write:
- "likes": up to ${VOICE_MAX_POINTS} things players praise most often
- "complaints": up to ${VOICE_MAX_POINTS} things players complain about most often
- "deck": one line on how the game runs on Steam Deck, only if reviews with "deck": true say something about it; otherwise null
Rules:
- each entry at most ${VOICE_MAX_CHARS} characters, plain words, no hype
- prefer points several reviews agree on over a single opinion
- no spoilers: never reveal plot, twists, endings or characters' fates
- use only what the reviews say; do not invent facts, features or numbers
- do not quote reviewers or mention the reviews themselves
- if reviews give nothing for a list, return it empty
Answer with JSON only: {"likes":[string],"complaints":[string],"deck":string|null}`;

/** Cuts text to `max` characters at a word boundary. */
function trimAtWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = text.slice(0, max + 1);
  const cut = head.lastIndexOf(' ');
  return (cut > 0 ? head.slice(0, cut) : text.slice(0, max)).replace(/[\s,;:\-–]+$/, '').trim();
}

const clean = (s: string) => trimAtWord(s.trim().replace(/\s+/g, ' '), VOICE_MAX_CHARS);
const cleanList = (list: readonly string[]) =>
  list
    .map(clean)
    .filter((s) => s.length > 0)
    .slice(0, VOICE_MAX_POINTS);

/**
 * Validates the model's answer and trims it to the schema's limits. Throws when it has the wrong
 * shape; null when no like or complaint is left (a Deck note alone is not a summary).
 */
export function cleanVoice(raw: unknown): PlayerVoice | null {
  const a = answerSchema.parse(raw);
  const likes = cleanList(a.likes);
  const complaints = cleanList(a.complaints);
  if (likes.length === 0 && complaints.length === 0) return null;
  return { likes, complaints, deck: clean(a.deck ?? '') || null };
}

/** DeepSeek summarizer: one JSON-mode call per game, with the title and review texts only. */
export function createDeepseekVoiceSummarizer(o: DeepseekChatOptions): VoiceSummarizer {
  return {
    async summarize(title: string, reviews: readonly VoiceReview[]) {
      const content = await deepseekChat(
        { timeoutMs: 40_000, ...o },
        {
          system: SYSTEM_PROMPT,
          user: {
            game: title,
            reviews: reviews.map((r) => ({
              up: r.votedUp,
              hours: r.playtimeMinutes === null ? null : Math.round(r.playtimeMinutes / 60),
              deck: r.deck,
              text: r.text,
            })),
          },
          maxTokens: 800,
          temperature: 0.3,
        },
      );
      return cleanVoice(JSON.parse(content));
    },
  };
}
