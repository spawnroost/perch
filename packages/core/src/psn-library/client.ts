import { defaultPsnApi, type PsnApi, type PsnAuthTokens } from './api.js';
import {
  PsnAuthFailedError,
  PsnNetworkError,
  PsnNotConfiguredError,
  PsnNotFoundError,
  PsnProfilePrivateError,
  PsnRateLimitedError,
} from './errors.js';
import { psnPlayedGamesSchema, type PsnProfile, type PsnTitle } from './schemas.js';
import { toPsnTitles } from './titles.js';

export interface PsnClientOptions {
  /** The server's NPSSO cookie value; unset makes every call throw PsnNotConfiguredError. */
  npsso: string | undefined;
  /** Injected in tests; defaults to psn-api. */
  api?: PsnApi;
  /** Injected in tests; milliseconds since epoch. */
  now?: () => number;
}

export interface PsnClient {
  /** The profile whose online ID is exactly `onlineId` (case-insensitive). */
  lookupAccountId(onlineId: string): Promise<PsnProfile>;
  /** The account's PS4/PS5 games with cleaned names, playtime and last-played. */
  fetchPlayedGames(accountId: string): Promise<PsnTitle[]>;
}

const PAGE = 200;
const MAX_PAGES = 10;
/** Renew the access token this long before it expires. */
const REFRESH_MARGIN_MS = 60_000;

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));
const isNetwork = (err: unknown) =>
  err instanceof TypeError ||
  err instanceof SyntaxError ||
  /fetch failed|network|econn|etimedout|enotfound|socket/i.test(message(err));
const isNpssoProblem = (err: unknown) => /npsso|access code/i.test(message(err));
const isExpiredToken = (err: unknown) =>
  /unauthori[sz]ed|expired|invalid[^.]*token|access token/i.test(message(err));
const isRateLimit = (err: unknown) => /rate.?limit|too many|\b429\b/i.test(message(err));

interface Session {
  tokens: PsnAuthTokens;
  accessExpiresAt: number;
  refreshExpiresAt: number;
}

/**
 * A PlayStation client for one server-wide NPSSO. The access token (1 h) is cached in memory and
 * renewed from the refresh token (10 d), then from the NPSSO; concurrent callers share one
 * exchange. A dead NPSSO throws PsnAuthFailedError and logs one admin alert until auth works again.
 */
export function createPsnClient(options: PsnClientOptions): PsnClient {
  const api = options.api ?? defaultPsnApi;
  const now = options.now ?? Date.now;
  let session: Session | null = null;
  let pending: Promise<string> | null = null;
  let alerted = false;

  const open = (tokens: PsnAuthTokens): Session => {
    if (!tokens?.accessToken) throw new PsnAuthFailedError();
    const at = now();
    return {
      tokens,
      accessExpiresAt: at + tokens.expiresIn * 1000,
      refreshExpiresAt: at + tokens.refreshTokenExpiresIn * 1000,
    };
  };

  async function fromNpsso(npsso: string): Promise<Session> {
    const code = await api.exchangeNpssoForAccessCode(npsso);
    return open(await api.exchangeAccessCodeForAuthTokens(code));
  }

  async function authenticate(npsso: string): Promise<string> {
    try {
      if (session && now() < session.refreshExpiresAt && session.tokens.refreshToken) {
        try {
          session = open(await api.exchangeRefreshTokenForAuthTokens(session.tokens.refreshToken));
        } catch (err) {
          if (isNetwork(err)) throw err;
          session = await fromNpsso(npsso);
        }
      } else {
        session = await fromNpsso(npsso);
      }
      alerted = false;
      return session.tokens.accessToken;
    } catch (err) {
      session = null;
      if (err instanceof PsnAuthFailedError || isNpssoProblem(err)) {
        if (!alerted) {
          alerted = true;
          console.error('PSN_NPSSO expired, renew it');
        }
        throw new PsnAuthFailedError();
      }
      throw new PsnNetworkError(`PlayStation sign-in failed: ${message(err)}`);
    }
  }

  function accessToken(): Promise<string> {
    const npsso = options.npsso;
    if (!npsso) return Promise.reject(new PsnNotConfiguredError());
    if (session && now() < session.accessExpiresAt - REFRESH_MARGIN_MS)
      return Promise.resolve(session.tokens.accessToken);
    pending ??= authenticate(npsso).finally(() => {
      pending = null;
    });
    return pending;
  }

  /** Runs one API call with a token; once more with a fresh token when PSN says it is stale. */
  async function call<T>(run: (auth: { accessToken: string }) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const token = await accessToken();
      try {
        return await run({ accessToken: token });
      } catch (err) {
        if (attempt === 0 && !isNetwork(err) && !isRateLimit(err) && isExpiredToken(err)) {
          session = null;
          continue;
        }
        throw err;
      }
    }
  }

  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

  return {
    async lookupAccountId(onlineId) {
      const id = onlineId.trim();
      let reply: Awaited<ReturnType<PsnApi['getProfileFromUserName']>>;
      try {
        reply = await call((auth) => api.getProfileFromUserName(auth, id));
      } catch (err) {
        if (err instanceof PsnAuthFailedError || err instanceof PsnNotConfiguredError) throw err;
        if (err instanceof PsnNetworkError) throw err;
        if (isRateLimit(err)) throw new PsnRateLimitedError();
        if (isNetwork(err))
          throw new PsnNetworkError(`PlayStation request failed: ${message(err)}`);
        if (/not found|does not exist|no such|2721/i.test(message(err)))
          throw new PsnNotFoundError();
        throw new PsnNetworkError(`PlayStation answered: ${message(err)}`);
      }
      const profile = reply?.profile;
      if (!profile?.accountId || !profile.onlineId || !same(profile.onlineId, id))
        throw new PsnNotFoundError();
      return { accountId: String(profile.accountId), onlineId: profile.onlineId };
    },

    async fetchPlayedGames(accountId) {
      const titles: PsnTitle[] = [];
      let seen = 0;
      for (let page = 0, offset = 0; page < MAX_PAGES; page++) {
        let raw: unknown;
        try {
          raw = await call((auth) =>
            api.getUserPlayedGames(auth, accountId, { limit: PAGE, offset }),
          );
        } catch (err) {
          if (err instanceof PsnAuthFailedError || err instanceof PsnNotConfiguredError) throw err;
          if (err instanceof PsnNetworkError) throw err;
          if (isRateLimit(err)) throw new PsnRateLimitedError();
          if (isNetwork(err))
            throw new PsnNetworkError(`PlayStation request failed: ${message(err)}`);
          if (/denied|forbidden|private|privacy|permission|not found/i.test(message(err)))
            throw new PsnProfilePrivateError();
          throw new PsnNetworkError(`PlayStation answered: ${message(err)}`);
        }
        const parsed = psnPlayedGamesSchema.safeParse(raw);
        if (!parsed.success) throw new PsnNetworkError('PlayStation sent an unexpected reply');
        const body = parsed.data;
        seen += body.titles.length;
        titles.push(...toPsnTitles(body.titles));
        const next = body.nextOffset;
        if (body.titles.length === 0 || next == null || next <= offset) break;
        if (body.totalItemCount != null && next >= body.totalItemCount) break;
        offset = next;
      }
      // Nothing at all is what a history that is not visible to Anyone looks like.
      if (seen === 0) throw new PsnProfilePrivateError();
      return titles;
    },
  };
}
