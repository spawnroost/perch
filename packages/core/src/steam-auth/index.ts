import { z } from 'zod';

export const STEAM_OPENID_ENDPOINT = 'https://steamcommunity.com/openid/login';
const OPENID_NS = 'http://specs.openid.net/auth/2.0';
const IDENTIFIER_SELECT = 'http://specs.openid.net/auth/2.0/identifier_select';
const CLAIMED_ID_RE = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;

/** Steam sign-in mode: a fresh login, or linking Steam to the signed-in account. */
export const SteamAuthModeSchema = z.enum(['login', 'link', 'onboard']);

/** Where a Steam round trip lands: link modes go back to the page that started them. */
export function steamReturnPath(mode: string | undefined): string {
  if (mode === 'link') return '/account';
  if (mode === 'onboard') return '/onboarding';
  return '/login';
}
export type SteamAuthMode = z.infer<typeof SteamAuthModeSchema>;

/** Redirect URL that sends the browser to Steam's OpenID login page. */
export function buildSteamLoginUrl({
  returnTo,
  realm,
}: {
  returnTo: string;
  realm: string;
}): string {
  const params = new URLSearchParams({
    'openid.ns': OPENID_NS,
    'openid.mode': 'checkid_setup',
    'openid.return_to': returnTo,
    'openid.realm': realm,
    'openid.identity': IDENTIFIER_SELECT,
    'openid.claimed_id': IDENTIFIER_SELECT,
  });
  return `${STEAM_OPENID_ENDPOINT}?${params.toString()}`;
}

export type SteamCallbackResult =
  | { ok: true; steamId: string }
  | { ok: false; reason: 'bad_mode' | 'bad_endpoint' | 'bad_claimed_id' | 'bad_return_to' };

/**
 * Local checks on Steam's callback query. These do not prove the assertion is genuine: the
 * caller must still ask Steam (`check_authentication`) before trusting the SteamID64.
 */
export function parseSteamCallback(
  query: Record<string, string | undefined>,
  expectedReturnTo: string,
): SteamCallbackResult {
  if (query['openid.mode'] !== 'id_res') return { ok: false, reason: 'bad_mode' };
  if (query['openid.op_endpoint'] !== STEAM_OPENID_ENDPOINT)
    return { ok: false, reason: 'bad_endpoint' };
  const match = CLAIMED_ID_RE.exec(query['openid.claimed_id'] ?? '');
  if (!match?.[1]) return { ok: false, reason: 'bad_claimed_id' };
  if (query['openid.return_to'] !== expectedReturnTo) return { ok: false, reason: 'bad_return_to' };
  return { ok: true, steamId: match[1] };
}

/** Steam gives no email, so Steam-only accounts get an unmailable `.invalid` address. */
export function steamPlaceholderEmail(steamId: string): string {
  return `${steamId}@steam.perch.invalid`;
}

/** True for any RFC 2606 `.invalid` address: never send mail to these. */
export function isSteamPlaceholderEmail(email: string): boolean {
  return email.toLowerCase().endsWith('.invalid');
}

/** Steam login errors surfaced to the web as `?steamError=<code>`. */
export const STEAM_ERROR_MESSAGES = {
  invalid: 'Steam sign-in could not be verified. Try again.',
  state: 'That Steam sign-in link expired. Try again.',
  conflict: 'That Steam account is already linked to another Perch account.',
  auth: 'Sign in to Perch first, then link Steam.',
  cancelled: 'Steam sign-in was cancelled.',
} as const;
export type SteamErrorCode = keyof typeof STEAM_ERROR_MESSAGES;

/** Readable text for a `steamError` code; unknown codes get a generic message. */
export function steamErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  return code in STEAM_ERROR_MESSAGES
    ? STEAM_ERROR_MESSAGES[code as SteamErrorCode]
    : 'Steam sign-in failed. Try again.';
}

/** What `GET /api/account` returns for the signed-in user. */
export const AccountResponseSchema = z.object({
  email: z.string(),
  steamId: z.string().nullable(),
  /** ISO time of the last Steam library import; null if never. */
  steamSyncedAt: z.string().nullable(),
  /** False when the server has no Steam key (or no game database), so the sync button is hidden. */
  steamSyncAvailable: z.boolean(),
  /** Linked Xbox gamertag; null when none. */
  xboxGamertag: z.string().nullable(),
  /** ISO time of the last Xbox import; null if never. */
  xboxSyncedAt: z.string().nullable(),
  /** False when the server has no OpenXBL key (or no game database), so the Xbox card is hidden. */
  xboxSyncAvailable: z.boolean(),
  /** Linked PlayStation online ID; null when none. */
  psnOnlineId: z.string().nullable(),
  /** ISO time of the last PlayStation import; null if never. */
  psnSyncedAt: z.string().nullable(),
  /** False when the server has no PSN_NPSSO (or no game database), so the PlayStation card is hidden. */
  psnSyncAvailable: z.boolean(),
  hasPassword: z.boolean(),
  /** Linked Google/Discord accounts that are currently enabled (provider ids). */
  linkedProviders: z.array(z.string()),
});
export type AccountResponse = z.infer<typeof AccountResponseSchema>;

/** Steam can't be unlinked when it is the only way in: no password and no usable social login. */
export function canUnlinkSteam(
  account: Pick<AccountResponse, 'steamId' | 'hasPassword' | 'linkedProviders'>,
): boolean {
  return account.steamId !== null && (account.hasPassword || account.linkedProviders.length > 0);
}

/** Same-origin URL that starts the Steam OpenID flow. */
export function steamStartPath(mode: SteamAuthMode): string {
  return `/api/auth/steam/start?mode=${mode}`;
}

/** The Account page's line under the title: the email, unless it is a Steam placeholder. */
export function accountSubtitle(
  email: string | undefined,
  steamId: string | null | undefined,
): string {
  if (email && !isSteamPlaceholderEmail(email)) return email;
  return steamId && email ? 'Signed in with Steam' : 'Signed in';
}
