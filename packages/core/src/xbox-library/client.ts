import type { z } from 'zod';
import {
  XboxGamertagNotFoundError,
  XboxNetworkError,
  XboxNotConfiguredError,
  XboxProfilePrivateError,
  XboxRateLimitedError,
} from './errors.js';
import {
  xboxSearchResponseSchema,
  xboxTitleHistoryResponseSchema,
  type XboxProfile,
  type XboxTitle,
} from './schemas.js';
import { toXboxTitles } from './titles.js';

const BASE = 'https://xbl.io/api/v2';

export interface XboxClientOptions {
  apiKey: string | undefined;
  /** Injected in tests; defaults to the global fetch. */
  fetch?: typeof fetch;
}

/** One OpenXBL GET. An empty body happens now and then: asked once more before giving up. */
async function get<S extends z.ZodType>(
  path: string,
  schema: S,
  { apiKey, fetch: doFetch = (...a) => fetch(...a) }: XboxClientOptions,
): Promise<z.infer<S>> {
  if (!apiKey) throw new XboxNotConfiguredError();
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await doFetch(`${BASE}${path}`, {
        headers: { 'X-Authorization': apiKey, Accept: 'application/json' },
      });
    } catch (err) {
      throw new XboxNetworkError(`OpenXBL request failed: ${(err as Error).message}`);
    }
    if (res.status === 429) throw new XboxRateLimitedError();
    if (!res.ok) throw new XboxNetworkError(`OpenXBL answered HTTP ${res.status}`, res.status);
    const text = await res.text().catch(() => '');
    if (!text.trim()) {
      if (attempt === 0) continue;
      // Twice empty with the budget spent is the limit; otherwise a private or empty profile.
      if (res.headers.get('x-ratelimit-remaining') === '0') throw new XboxRateLimitedError();
      throw new XboxProfilePrivateError();
    }
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new XboxNetworkError('OpenXBL sent an unreadable reply');
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new XboxNetworkError('OpenXBL sent an unexpected reply');
    return parsed.data;
  }
}

const same = (a: string | null | undefined, b: string) =>
  a != null && a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The profile whose gamertag is exactly `gamertag` (case-insensitive). Search is fuzzy, so a
 * near miss is not taken for the player: it throws XboxGamertagNotFoundError instead.
 */
export async function lookupXuid(
  gamertag: string,
  options: XboxClientOptions,
): Promise<XboxProfile> {
  const tag = gamertag.trim();
  const body = await get(`/search/${encodeURIComponent(tag)}`, xboxSearchResponseSchema, options);
  const hit = body.content.people?.find(
    (p) =>
      same(p.gamertag, tag) || same(p.modernGamertag, tag) || same(p.uniqueModernGamertag, tag),
  );
  if (!hit) throw new XboxGamertagNotFoundError();
  return { xuid: hit.xuid, gamertag: hit.gamertag?.trim() || tag };
}

/** The player's games (not apps), newest-played order as sent, with cleaned names. */
export async function fetchTitleHistory(
  xuid: string,
  options: XboxClientOptions,
): Promise<XboxTitle[]> {
  const body = await get(
    `/player/titleHistory/${encodeURIComponent(xuid)}`,
    xboxTitleHistoryResponseSchema,
    options,
  );
  const titles = body.content.titles ?? [];
  // No titles at all is what a private game history looks like.
  if (titles.length === 0) throw new XboxProfilePrivateError();
  return toXboxTitles(titles);
}
