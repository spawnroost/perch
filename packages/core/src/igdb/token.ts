import { twitchTokenSchema } from './schemas.js';

const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
/** Refresh this long before the token actually expires. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

export interface TokenProviderOptions {
  clientId: string;
  clientSecret: string;
  fetch?: typeof fetch;
}

/** Twitch app token (client credentials), held in memory only. Lasts ~65 days. */
export class TokenProvider {
  private token: string | null = null;
  private expiresAt = 0;
  private inflight: Promise<string> | null = null;
  private readonly doFetch: typeof fetch;

  constructor(private readonly opts: TokenProviderOptions) {
    // Resolve the global lazily so a test stub installed later is still honoured.
    this.doFetch = opts.fetch ?? ((...args) => fetch(...args));
  }

  async get(): Promise<string> {
    if (this.token && Date.now() < this.expiresAt - REFRESH_MARGIN_MS) return this.token;
    return this.refresh();
  }

  /** Forces a new token (used after a 401). Concurrent callers share one request. */
  refresh(): Promise<string> {
    this.inflight ??= this.fetchToken().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async fetchToken(): Promise<string> {
    const url = new URL(TOKEN_URL);
    url.searchParams.set('client_id', this.opts.clientId);
    url.searchParams.set('client_secret', this.opts.clientSecret);
    url.searchParams.set('grant_type', 'client_credentials');
    const res = await this.doFetch(url, { method: 'POST' });
    if (!res.ok) throw new Error(`Twitch token request failed: HTTP ${res.status}`);
    const body = twitchTokenSchema.parse(await res.json());
    this.token = body.access_token;
    this.expiresAt = Date.now() + body.expires_in * 1000;
    return this.token;
  }
}
