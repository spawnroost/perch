import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export interface GameFixture {
  name: string;
  igdbId: number;
  search: Array<Record<string, unknown>>;
  game: Array<Record<string, unknown>>;
  timeToBeat: Array<Record<string, unknown>>;
}

const dir = fileURLToPath(new URL('../fixtures/igdb/', import.meta.url));
export const fixtures: GameFixture[] = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(dir + f, 'utf8')));

export function fixture(name: string): GameFixture {
  const f = fixtures.find((x) => x.name === name);
  if (!f) throw new Error(`no fixture for ${name}`);
  return f;
}

export interface Call {
  url: string;
  body: string;
  auth: string | null;
}

export interface FakeFetch {
  fetch: typeof fetch;
  calls: Call[];
  /** Calls to the Twitch token endpoint / to the IGDB API. */
  tokenCalls(): Call[];
  apiCalls(): Call[];
}

const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

/**
 * A fake network serving the recorded fixtures. `intercept` runs first for each IGDB API call
 * (n = 1-based API call number) and may return a Response to override the fixture answer.
 */
export function fakeFetch(
  opts: {
    expiresIn?: number;
    intercept?: (call: Call & { n: number }) => Response | undefined;
  } = {},
): FakeFetch {
  const calls: Call[] = [];
  let tokenCount = 0;
  let apiCount = 0;
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    const call: Call = {
      url,
      body: String(init?.body ?? ''),
      auth: headers.get('authorization'),
    };
    calls.push(call);
    if (url.startsWith('https://id.twitch.tv/oauth2/token')) {
      tokenCount++;
      return json({ access_token: `token-${tokenCount}`, expires_in: opts.expiresIn ?? 5_000_000 });
    }
    apiCount++;
    const override = opts.intercept?.({ ...call, n: apiCount });
    if (override) return override;
    if (url.endsWith('/game_time_to_beats')) {
      const id = Number(/game_id = (\d+)/.exec(call.body)?.[1]);
      return json(fixtures.find((f) => f.igdbId === id)?.timeToBeat ?? []);
    }
    const search = /^search "([^"]*)"/.exec(call.body)?.[1];
    if (search !== undefined) {
      const f = fixtures.find((x) => x.name.toLowerCase() === search.toLowerCase());
      return json(f?.search ?? []);
    }
    const id = Number(/where id = (\d+)/.exec(call.body)?.[1]);
    return json(fixtures.find((f) => f.igdbId === id)?.game ?? []);
  }) as typeof fetch;
  const wrapped = (input: string | URL | Request, init?: RequestInit) => impl(input, init);
  return {
    fetch: wrapped as typeof fetch,
    calls,
    tokenCalls: () => calls.filter((c) => c.url.includes('id.twitch.tv')),
    apiCalls: () => calls.filter((c) => c.url.includes('api.igdb.com')),
  };
}

export { json };
