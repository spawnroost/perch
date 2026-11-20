import {
  exchangeAccessCodeForAuthTokens,
  exchangeNpssoForAccessCode,
  exchangeRefreshTokenForAuthTokens,
  getProfileFromUserName,
  getUserPlayedGames,
} from 'psn-api';

export interface PsnAuthTokens {
  accessToken: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
  refreshToken: string;
  /** Seconds until the refresh token expires. */
  refreshTokenExpiresIn: number;
}

/** The slice of psn-api the client uses; tests pass a fake, the default calls PlayStation. */
export interface PsnApi {
  exchangeNpssoForAccessCode(npsso: string): Promise<string>;
  exchangeAccessCodeForAuthTokens(code: string): Promise<PsnAuthTokens>;
  exchangeRefreshTokenForAuthTokens(refreshToken: string): Promise<PsnAuthTokens>;
  getProfileFromUserName(
    auth: { accessToken: string },
    onlineId: string,
  ): Promise<{ profile: { onlineId: string; accountId: string } }>;
  getUserPlayedGames(
    auth: { accessToken: string },
    accountId: string,
    options: { limit: number; offset: number },
  ): Promise<unknown>;
}

export const defaultPsnApi: PsnApi = {
  exchangeNpssoForAccessCode,
  exchangeAccessCodeForAuthTokens,
  exchangeRefreshTokenForAuthTokens,
  getProfileFromUserName,
  getUserPlayedGames,
};
