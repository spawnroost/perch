import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createPsnClient,
  PsnAuthFailedError,
  PsnNetworkError,
  PsnNotConfiguredError,
  PsnNotFoundError,
  PsnProfilePrivateError,
  PsnRateLimitedError,
  psnLinkSchema,
  type PsnApi,
} from '../../src/index.js';

const tokens = (n: number, expiresIn = 3600) => ({
  accessToken: `access-${n}`,
  expiresIn,
  refreshToken: `refresh-${n}`,
  refreshTokenExpiresIn: 864_000,
});

const played = (n: number, nextOffset?: number, total = 3) => ({
  titles: Array.from({ length: n }, (_, i) => ({
    titleId: `CUSA${nextOffset ?? 0}${i}_00`,
    name: `Game ${nextOffset ?? 0}-${i}`,
    category: 'ps4_game',
    playDuration: 'PT2H',
    lastPlayedDateTime: '2026-11-01T00:00:00.000Z',
  })),
  totalItemCount: total,
  nextOffset,
});

function fakeApi(over: Partial<PsnApi> = {}) {
  let n = 0;
  const base = {
    exchangeNpssoForAccessCode: vi.fn(async () => 'code'),
    exchangeAccessCodeForAuthTokens: vi.fn(async () => tokens(++n)),
    exchangeRefreshTokenForAuthTokens: vi.fn(async () => tokens(++n)),
    getProfileFromUserName: vi.fn(async (_a: unknown, name: string) => ({
      profile: { onlineId: name, accountId: '555' },
    })),
    getUserPlayedGames: vi.fn<PsnApi['getUserPlayedGames']>(async () => played(2)),
  };
  return Object.assign(base, over) as typeof base;
}

afterEach(() => vi.restoreAllMocks());

describe('PSN auth', () => {
  it('throws not-configured without an NPSSO and never calls PSN', async () => {
    const api = fakeApi();
    const c = createPsnClient({ npsso: undefined, api });
    await expect(c.lookupAccountId('x')).rejects.toBeInstanceOf(PsnNotConfiguredError);
    expect(api.exchangeNpssoForAccessCode).not.toHaveBeenCalled();
  });

  it('exchanges once and reuses the access token until it nears expiry', async () => {
    const api = fakeApi();
    let t = 0;
    const c = createPsnClient({ npsso: 'n', api, now: () => t });
    await c.lookupAccountId('Hakoom');
    await c.fetchPlayedGames('555');
    expect(api.exchangeNpssoForAccessCode).toHaveBeenCalledTimes(1);
    expect(api.exchangeNpssoForAccessCode).toHaveBeenCalledWith('n');
    expect(api.exchangeAccessCodeForAuthTokens).toHaveBeenCalledTimes(1);
    expect(api.getProfileFromUserName).toHaveBeenCalledWith({ accessToken: 'access-1' }, 'Hakoom');
    // Inside the last minute the refresh token is used instead of a fresh NPSSO exchange.
    t = 3_600_000 - 30_000;
    await c.fetchPlayedGames('555');
    expect(api.exchangeRefreshTokenForAuthTokens).toHaveBeenCalledWith('refresh-1');
    expect(api.exchangeNpssoForAccessCode).toHaveBeenCalledTimes(1);
    expect(api.getUserPlayedGames).toHaveBeenLastCalledWith(
      { accessToken: 'access-2' },
      '555',
      expect.anything(),
    );
  });

  it('falls back to the NPSSO when the refresh fails', async () => {
    const api = fakeApi({
      exchangeRefreshTokenForAuthTokens: vi.fn(async () => {
        throw new Error('refresh denied');
      }),
    });
    let t = 0;
    const c = createPsnClient({ npsso: 'n', api, now: () => t });
    await c.fetchPlayedGames('555');
    t = 4_000_000;
    await c.fetchPlayedGames('555');
    expect(api.exchangeNpssoForAccessCode).toHaveBeenCalledTimes(2);
  });

  it('shares one auth between concurrent callers', async () => {
    const api = fakeApi();
    const c = createPsnClient({ npsso: 'n', api });
    await Promise.all([c.fetchPlayedGames('1'), c.fetchPlayedGames('2'), c.lookupAccountId('a')]);
    expect(api.exchangeNpssoForAccessCode).toHaveBeenCalledTimes(1);
  });

  it('a dead NPSSO is auth_failed, logged as an admin alert once, and retried on the next call', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const api = fakeApi({
      exchangeNpssoForAccessCode: vi.fn(async () => {
        throw new Error(
          'There was a problem retrieving your PSN access code. Is your NPSSO code valid?',
        );
      }),
    });
    const c = createPsnClient({ npsso: 'bad', api });
    await expect(c.lookupAccountId('x')).rejects.toBeInstanceOf(PsnAuthFailedError);
    await expect(c.lookupAccountId('x')).rejects.toBeInstanceOf(PsnAuthFailedError);
    expect(err).toHaveBeenCalledTimes(1);
    expect(String(err.mock.calls[0]![0])).toContain('PSN_NPSSO expired, renew it');
    expect(api.exchangeNpssoForAccessCode).toHaveBeenCalledTimes(2);
  });

  it('a token reply without an access token is auth_failed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const api = fakeApi({
      exchangeAccessCodeForAuthTokens: vi.fn(async () => ({ ...tokens(1), accessToken: '' })),
    });
    await expect(createPsnClient({ npsso: 'n', api }).lookupAccountId('x')).rejects.toBeInstanceOf(
      PsnAuthFailedError,
    );
  });

  it('a network failure while authenticating is unavailable, not auth_failed', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const api = fakeApi({
      exchangeNpssoForAccessCode: vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    });
    await expect(createPsnClient({ npsso: 'n', api }).lookupAccountId('x')).rejects.toBeInstanceOf(
      PsnNetworkError,
    );
    expect(err).not.toHaveBeenCalled();
  });

  it('re-authenticates once when PSN says the access token is no longer valid', async () => {
    const api = fakeApi();
    api.getUserPlayedGames.mockRejectedValueOnce(new Error('Unauthorized: access token expired'));
    const c = createPsnClient({ npsso: 'n', api });
    const titles = await c.fetchPlayedGames('555');
    expect(titles).toHaveLength(2);
    expect(api.exchangeNpssoForAccessCode).toHaveBeenCalledTimes(2);
  });
});

describe('lookupAccountId', () => {
  it('returns the account id and the canonical online ID, matched case-insensitively', async () => {
    const api = fakeApi({
      getProfileFromUserName: vi.fn(async () => ({
        profile: { onlineId: 'Hakoom', accountId: '1234567890' },
      })),
    });
    const c = createPsnClient({ npsso: 'n', api });
    expect(await c.lookupAccountId(' hakoom ')).toEqual({
      accountId: '1234567890',
      onlineId: 'Hakoom',
    });
    expect(api.getProfileFromUserName).toHaveBeenCalledWith(expect.anything(), 'hakoom');
  });

  it('is not-found for an unknown ID or a different profile in the reply', async () => {
    const api = fakeApi({
      getProfileFromUserName: vi
        .fn()
        .mockRejectedValueOnce(new Error('Resource not found'))
        .mockResolvedValueOnce({ profile: { onlineId: 'Other', accountId: '9' } }),
    });
    const c = createPsnClient({ npsso: 'n', api });
    await expect(c.lookupAccountId('ghost')).rejects.toBeInstanceOf(PsnNotFoundError);
    await expect(c.lookupAccountId('ghost')).rejects.toBeInstanceOf(PsnNotFoundError);
  });

  it('maps a rate limit and an unreadable failure', async () => {
    const api = fakeApi({
      getProfileFromUserName: vi
        .fn()
        .mockRejectedValueOnce(new Error('Too many requests'))
        .mockRejectedValueOnce(new SyntaxError('Unexpected token <')),
    });
    const c = createPsnClient({ npsso: 'n', api });
    await expect(c.lookupAccountId('a')).rejects.toBeInstanceOf(PsnRateLimitedError);
    await expect(c.lookupAccountId('a')).rejects.toBeInstanceOf(PsnNetworkError);
  });
});

describe('fetchPlayedGames', () => {
  it('asks for pages of 200 and follows nextOffset', async () => {
    const api = fakeApi();
    api.getUserPlayedGames
      .mockResolvedValueOnce(played(2, 200, 203))
      .mockResolvedValueOnce(played(1, undefined, 203));
    const titles = await createPsnClient({ npsso: 'n', api }).fetchPlayedGames('555');
    expect(titles).toHaveLength(3);
    expect(api.getUserPlayedGames.mock.calls.map((c) => c[2])).toEqual([
      { limit: 200, offset: 0 },
      { limit: 200, offset: 200 },
    ]);
  });

  it('stops on a nextOffset that does not advance', async () => {
    const api = fakeApi();
    api.getUserPlayedGames.mockResolvedValue(played(1, 0, 999));
    await createPsnClient({ npsso: 'n', api }).fetchPlayedGames('555');
    expect(api.getUserPlayedGames).toHaveBeenCalledTimes(1);
  });

  it('keeps games only and cleans names', async () => {
    const api = fakeApi({
      getUserPlayedGames: vi.fn(async () => ({
        titles: [
          { titleId: 'A', name: 'Rocket League®', category: 'ps4_game', playDuration: 'PT1H' },
          { titleId: 'B', name: 'Netflix', category: 'ps5_native_media_app' },
        ],
        totalItemCount: 2,
      })),
    });
    const out = await createPsnClient({ npsso: 'n', api }).fetchPlayedGames('555');
    expect(out).toMatchObject([{ name: 'Rocket League', platform: 'ps4', minutes: 60 }]);
  });

  it('an empty list or a denial is the private-history error', async () => {
    const api = fakeApi();
    api.getUserPlayedGames
      .mockResolvedValueOnce({ titles: [], totalItemCount: 0 })
      .mockRejectedValueOnce(new Error('Access denied'));
    const c = createPsnClient({ npsso: 'n', api });
    await expect(c.fetchPlayedGames('555')).rejects.toBeInstanceOf(PsnProfilePrivateError);
    await expect(c.fetchPlayedGames('555')).rejects.toBeInstanceOf(PsnProfilePrivateError);
  });

  it('maps rate limits, network failures and malformed replies', async () => {
    const api = fakeApi();
    api.getUserPlayedGames
      .mockRejectedValueOnce(new Error('Rate limit exceeded'))
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce({ nope: true } as never);
    const c = createPsnClient({ npsso: 'n', api });
    await expect(c.fetchPlayedGames('555')).rejects.toBeInstanceOf(PsnRateLimitedError);
    await expect(c.fetchPlayedGames('555')).rejects.toBeInstanceOf(PsnNetworkError);
    await expect(c.fetchPlayedGames('555')).rejects.toBeInstanceOf(PsnNetworkError);
  });
});

describe('review fixes', () => {
  it('only accepts online IDs PlayStation allows', () => {
    for (const ok of ['Perch_Test-Tag', 'abc', 'a'.repeat(16)])
      expect(psnLinkSchema.safeParse({ onlineId: ` ${ok} ` })).toMatchObject({
        success: true,
        data: { onlineId: ok },
      });
    for (const bad of ['ab', 'a'.repeat(17), 'has space', 'a/b', 'a?b=1', '../x', 'é-tag'])
      expect(psnLinkSchema.safeParse({ onlineId: bad }).success).toBe(false);
    const msg = psnLinkSchema.safeParse({ onlineId: 'a/b' });
    expect(JSON.stringify(msg.error?.issues)).toMatch(/letters, numbers/i);
  });

  it('url-encodes the online ID before handing it to psn-api', async () => {
    const api = fakeApi();
    await createPsnClient({ npsso: 'n', api })
      .lookupAccountId('a b')
      .catch(() => undefined);
    expect(api.getProfileFromUserName.mock.calls[0]![1]).toBe('a%20b');
  });

  it('treats PlayStation "Not permitted by access control" as a private history', async () => {
    const api = fakeApi();
    api.getUserPlayedGames.mockRejectedValueOnce(new Error('Not permitted by access control'));
    await expect(
      createPsnClient({ npsso: 'n', api }).fetchPlayedGames('555'),
    ).rejects.toBeInstanceOf(PsnProfilePrivateError);
  });

  it('classifies a 429 as rate limited even when it looks like a network or parse failure', async () => {
    const api = fakeApi();
    api.getUserPlayedGames
      .mockRejectedValueOnce(new SyntaxError('Unexpected token < in JSON (HTTP 429)'))
      .mockRejectedValueOnce(new TypeError('network error: 429 Too Many Requests'));
    const c = createPsnClient({ npsso: 'n', api });
    await expect(c.fetchPlayedGames('555')).rejects.toBeInstanceOf(PsnRateLimitedError);
    await expect(c.fetchPlayedGames('555')).rejects.toBeInstanceOf(PsnRateLimitedError);
  });

  it('a rate limit while signing in is rate limited, not unavailable', async () => {
    const api = fakeApi({
      exchangeNpssoForAccessCode: vi.fn(async () => {
        throw new Error('Too many requests (429)');
      }),
    });
    await expect(
      createPsnClient({ npsso: 'n', api }).lookupAccountId('abc'),
    ).rejects.toBeInstanceOf(PsnRateLimitedError);
  });

  it('keeps the cached session through a network failure, drops it on an auth failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let t = 0;
    const api = fakeApi();
    const c = createPsnClient({ npsso: 'n', api, now: () => t });
    await c.fetchPlayedGames('555');
    t = 3_600_000; // access token due for renewal
    api.exchangeRefreshTokenForAuthTokens.mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(c.fetchPlayedGames('555')).rejects.toBeInstanceOf(PsnNetworkError);
    await c.fetchPlayedGames('555');
    // The refresh token was still usable: no second NPSSO exchange.
    expect(api.exchangeNpssoForAccessCode).toHaveBeenCalledTimes(1);
    expect(api.exchangeRefreshTokenForAuthTokens).toHaveBeenCalledTimes(2);

    t = 7_200_000;
    api.exchangeRefreshTokenForAuthTokens.mockRejectedValueOnce(new Error('invalid refresh'));
    api.exchangeNpssoForAccessCode.mockRejectedValueOnce(
      new Error('There was a problem retrieving your PSN access code. Is your NPSSO code valid?'),
    );
    await expect(c.fetchPlayedGames('555')).rejects.toBeInstanceOf(PsnAuthFailedError);
    await c.fetchPlayedGames('555');
    expect(api.exchangeNpssoForAccessCode).toHaveBeenCalledTimes(3); // session was dropped
  });
});
