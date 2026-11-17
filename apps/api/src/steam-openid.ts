import { STEAM_OPENID_ENDPOINT } from '@perch/core';

/** Asks Steam whether a callback's OpenID assertion is genuine (`check_authentication`). */
export interface SteamOpenIdVerifier {
  verify(params: Record<string, string>): Promise<boolean>;
}

export function createSteamOpenIdVerifier(fetchFn: typeof fetch = fetch): SteamOpenIdVerifier {
  return {
    async verify(params) {
      const body = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (k.startsWith('openid.')) body.set(k, v);
      }
      body.set('openid.mode', 'check_authentication');
      const res = await fetchFn(STEAM_OPENID_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return false;
      const text = await res.text();
      return /^is_valid:true\s*$/m.test(text);
    },
  };
}
