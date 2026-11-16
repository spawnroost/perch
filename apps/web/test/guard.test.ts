import { describe, expect, it } from 'vitest';
import { decideRoute } from '../src/lib/guard.js';

const redirect = (to: string) => ({ kind: 'redirect', to });
const allow = { kind: 'allow' };
const wait = { kind: 'wait' };

describe('decideRoute: signed out', () => {
  it('sends protected paths to login', () => {
    expect(decideRoute({ auth: 'out', hasLibrary: undefined, path: '/' })).toEqual(
      redirect('/login'),
    );
    expect(decideRoute({ auth: 'out', hasLibrary: undefined, path: '/onboarding' })).toEqual(
      redirect('/login'),
    );
  });
  it('allows the auth pages', () => {
    for (const path of [
      '/login',
      '/signup',
      '/forgot-password',
      '/reset-password',
      '/verify-email',
    ]) {
      expect(decideRoute({ auth: 'out', hasLibrary: undefined, path })).toEqual(allow);
    }
  });
});

describe('decideRoute: session loading', () => {
  it('waits on every path', () => {
    expect(decideRoute({ auth: 'loading', hasLibrary: undefined, path: '/' })).toEqual(wait);
    expect(decideRoute({ auth: 'loading', hasLibrary: undefined, path: '/login' })).toEqual(wait);
  });
});

describe('decideRoute: signed in', () => {
  it('bounces guest-only pages home', () => {
    expect(decideRoute({ auth: 'in', hasLibrary: true, path: '/login' })).toEqual(redirect('/'));
    expect(decideRoute({ auth: 'in', hasLibrary: true, path: '/signup' })).toEqual(redirect('/'));
  });
  it('leaves reset-password and verify-email open', () => {
    expect(decideRoute({ auth: 'in', hasLibrary: true, path: '/reset-password' })).toEqual(allow);
    expect(decideRoute({ auth: 'in', hasLibrary: true, path: '/verify-email' })).toEqual(allow);
  });
  it('waits for the library before deciding', () => {
    expect(decideRoute({ auth: 'in', hasLibrary: undefined, path: '/' })).toEqual(wait);
  });
  it('sends an empty library to onboarding', () => {
    expect(decideRoute({ auth: 'in', hasLibrary: false, path: '/' })).toEqual(
      redirect('/onboarding'),
    );
  });
  it('allows the app once the library has games', () => {
    expect(decideRoute({ auth: 'in', hasLibrary: true, path: '/' })).toEqual(allow);
  });
  it('keeps the user in onboarding without waiting, even after the first game lands', () => {
    expect(decideRoute({ auth: 'in', hasLibrary: undefined, path: '/onboarding' })).toEqual(allow);
    expect(decideRoute({ auth: 'in', hasLibrary: false, path: '/onboarding' })).toEqual(allow);
    expect(decideRoute({ auth: 'in', hasLibrary: true, path: '/onboarding' })).toEqual(allow);
  });
});
