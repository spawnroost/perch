import { describe, expect, it } from 'vitest';
import {
  cleanVoice,
  createDeepseekVoiceSummarizer,
  VOICE_MAX_CHARS,
  type VoiceReview,
} from '../../src/player-voice/index.js';

const review = (over: Partial<VoiceReview> = {}): VoiceReview => ({
  text: 'Great game with tight combat and a wonderful soundtrack.',
  votedUp: true,
  playtimeMinutes: 600,
  deck: false,
  ...over,
});

describe('cleanVoice', () => {
  it('keeps at most 3 likes and 3 complaints, trimmed and non-empty', () => {
    const v = cleanVoice({
      likes: ['  a  ', '', 'b', 'c', 'd'],
      complaints: ['x', ' ', 'y'],
      deck: null,
    });
    expect(v).toEqual({ likes: ['a', 'b', 'c'], complaints: ['x', 'y'], deck: null });
  });

  it('cuts long points at a word boundary to 120 characters', () => {
    const long = `${'word '.repeat(60)}end`;
    const v = cleanVoice({ likes: [long], complaints: [], deck: long })!;
    expect(v.likes[0]!.length).toBeLessThanOrEqual(VOICE_MAX_CHARS);
    expect(v.likes[0]!.endsWith('word')).toBe(true);
    expect(v.deck!.length).toBeLessThanOrEqual(VOICE_MAX_CHARS);
  });

  it('turns a blank deck into null', () => {
    expect(cleanVoice({ likes: ['a'], complaints: [], deck: '  ' })!.deck).toBeNull();
    expect(cleanVoice({ likes: ['a'], complaints: [] })!.deck).toBeNull();
  });

  it('is null when there is nothing to show', () => {
    expect(cleanVoice({ likes: [], complaints: [], deck: 'Runs well' })).toBeNull();
    expect(cleanVoice({ likes: [' '], complaints: [''], deck: null })).toBeNull();
  });

  it('throws on a wrong shape', () => {
    expect(() => cleanVoice({ likes: 'a', complaints: [] })).toThrow();
    expect(() => cleanVoice(null)).toThrow();
    expect(() => cleanVoice({ likes: [1], complaints: [] })).toThrow();
  });
});

describe('createDeepseekVoiceSummarizer', () => {
  function stub(content: unknown, status = 200) {
    const calls: {
      url: string;
      body: { messages: { content: string }[]; [k: string]: unknown };
    }[] = [];
    const fetchFn = (async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init.body)) });
      return new Response(
        JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }),
        { status },
      );
    }) as unknown as typeof fetch;
    return { calls, summarizer: createDeepseekVoiceSummarizer({ apiKey: 'k', fetch: fetchFn }) };
  }

  it('sends only the title and review texts, in JSON mode with thinking off', async () => {
    const s = stub({ likes: ['Tight combat'], complaints: [], deck: null });
    const out = await s.summarizer.summarize('Hades', [review(), review({ deck: true })]);
    expect(out).toEqual({ likes: ['Tight combat'], complaints: [], deck: null });
    const body = s.calls[0]!.body;
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.thinking).toEqual({ type: 'disabled' });
    expect(body.temperature).toBe(0.3);
    const user = JSON.parse(body.messages[1]!.content);
    expect(user.game).toBe('Hades');
    expect(user.reviews).toHaveLength(2);
    expect(Object.keys(user.reviews[0]).sort()).toEqual(['deck', 'hours', 'text', 'up']);
  });

  it('rejects a malformed answer', async () => {
    const s = stub({ likes: 'no' });
    await expect(s.summarizer.summarize('Hades', [review()])).rejects.toThrow();
  });

  it('throws on an HTTP error', async () => {
    const s = stub({}, 500);
    await expect(s.summarizer.summarize('Hades', [review()])).rejects.toThrow(/500/);
  });
});
