import { describe, expect, it } from 'vitest';
import {
  STEAM_OPENID_ENDPOINT,
  buildSteamLoginUrl,
  parseSteamCallback,
  isSteamPlaceholderEmail,
  steamErrorMessage,
  canUnlinkSteam,
  accountSubtitle,
  steamStartPath,
  steamPlaceholderEmail,
} from '../../src/steam-auth/index.js';

const RETURN_TO = 'http://localhost:8787/api/auth/steam/callback?state=abc';
const REALM = 'http://localhost:8787';
const ID = '76561198000000001';

function validQuery(over: Record<string, string> = {}): Record<string, string> {
  return {
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'id_res',
    'openid.op_endpoint': STEAM_OPENID_ENDPOINT,
    'openid.claimed_id': `https://steamcommunity.com/openid/id/${ID}`,
    'openid.identity': `https://steamcommunity.com/openid/id/${ID}`,
    'openid.return_to': RETURN_TO,
    'openid.assoc_handle': '1234',
    'openid.signed': 'signed,op_endpoint',
    'openid.sig': 'sig=',
    ...over,
  };
}

describe('buildSteamLoginUrl', () => {
  it('builds an OpenID 2.0 checkid_setup request', () => {
    const url = new URL(buildSteamLoginUrl({ returnTo: RETURN_TO, realm: REALM }));
    expect(url.origin + url.pathname).toBe(STEAM_OPENID_ENDPOINT);
    const p = url.searchParams;
    expect(p.get('openid.ns')).toBe('http://specs.openid.net/auth/2.0');
    expect(p.get('openid.mode')).toBe('checkid_setup');
    expect(p.get('openid.return_to')).toBe(RETURN_TO);
    expect(p.get('openid.realm')).toBe(REALM);
    const select = 'http://specs.openid.net/auth/2.0/identifier_select';
    expect(p.get('openid.claimed_id')).toBe(select);
    expect(p.get('openid.identity')).toBe(select);
  });
});

describe('parseSteamCallback', () => {
  it('returns the SteamID64 for a valid callback', () => {
    expect(parseSteamCallback(validQuery(), RETURN_TO)).toEqual({ ok: true, steamId: ID });
  });

  it('rejects a wrong mode', () => {
    expect(parseSteamCallback(validQuery({ 'openid.mode': 'cancel' }), RETURN_TO)).toEqual({
      ok: false,
      reason: 'bad_mode',
    });
  });

  it('rejects a foreign op_endpoint', () => {
    const q = validQuery({ 'openid.op_endpoint': 'https://evil.example/openid/login' });
    expect(parseSteamCallback(q, RETURN_TO)).toEqual({ ok: false, reason: 'bad_endpoint' });
  });

  it('rejects a claimed_id that is not a 17-digit Steam id URL', () => {
    for (const claimed of [
      'https://evil.example/openid/id/76561198000000001',
      'https://steamcommunity.com/openid/id/123',
      `https://steamcommunity.com/openid/id/${ID}/extra`,
      `http://steamcommunity.com/openid/id/${ID}`,
    ]) {
      const q = validQuery({ 'openid.claimed_id': claimed });
      expect(parseSteamCallback(q, RETURN_TO)).toEqual({ ok: false, reason: 'bad_claimed_id' });
    }
  });

  it('rejects a mismatched return_to', () => {
    const q = validQuery({
      'openid.return_to': 'http://localhost:8787/api/auth/steam/callback?state=zzz',
    });
    expect(parseSteamCallback(q, RETURN_TO)).toEqual({ ok: false, reason: 'bad_return_to' });
  });

  it('rejects missing fields', () => {
    expect(parseSteamCallback({}, RETURN_TO)).toEqual({ ok: false, reason: 'bad_mode' });
  });
});

describe('placeholder email', () => {
  it('round-trips and detects placeholders', () => {
    expect(steamPlaceholderEmail(ID)).toBe(`${ID}@steam.perch.invalid`);
    expect(isSteamPlaceholderEmail(steamPlaceholderEmail(ID))).toBe(true);
    expect(isSteamPlaceholderEmail('x@example.com')).toBe(false);
    expect(isSteamPlaceholderEmail('x@foo.INVALID')).toBe(true);
  });
});

describe('steamErrorMessage', () => {
  it('maps known codes, falls back for unknown, null for none', () => {
    expect(steamErrorMessage('conflict')).toMatch(/already linked/);
    expect(steamErrorMessage('???')).toMatch(/failed/);
    expect(steamErrorMessage(null)).toBeNull();
  });
});

describe('account helpers', () => {
  it('only allows unlinking a linked account that has a password', () => {
    expect(canUnlinkSteam({ steamId: ID, hasPassword: true })).toBe(true);
    expect(canUnlinkSteam({ steamId: ID, hasPassword: false })).toBe(false);
    expect(canUnlinkSteam({ steamId: null, hasPassword: true })).toBe(false);
    expect(canUnlinkSteam({ steamId: ID, hasPassword: false, linkedProviders: ['google'] })).toBe(
      true,
    );
  });
  it('builds the start path', () => {
    expect(steamStartPath('login')).toBe('/api/auth/steam/start?mode=login');
    expect(steamStartPath('link')).toBe('/api/auth/steam/start?mode=link');
  });
});

describe('accountSubtitle', () => {
  it('shows real emails, labels Steam placeholders, else falls back', () => {
    expect(accountSubtitle('a@b.dev', null)).toBe('a@b.dev');
    expect(accountSubtitle(steamPlaceholderEmail(ID), ID)).toBe('Signed in with Steam');
    expect(accountSubtitle(steamPlaceholderEmail(ID), null)).toBe('Signed in');
    expect(accountSubtitle(undefined, ID)).toBe('Signed in');
  });
});
