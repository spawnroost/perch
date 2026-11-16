/** Route guard decision: pure, so the router component stays a thin wrapper. */

export type AuthState = 'loading' | 'out' | 'in';

export type Decision = { kind: 'allow' } | { kind: 'wait' } | { kind: 'redirect'; to: string };

export const LOGIN_PATH = '/login';
export const ONBOARDING_PATH = '/onboarding';
export const HOME_PATH = '/';

/** Only for signed-out visitors; signed-in users are sent home. */
const GUEST_ONLY = new Set(['/login', '/signup', '/forgot-password']);
/** Reached from an email link, so usable in any auth state. */
const ALWAYS_OPEN = new Set(['/verify-email', '/reset-password']);

export interface GuardInput {
  auth: AuthState;
  /** `undefined` while the library is loading. */
  hasLibrary: boolean | undefined;
  path: string;
}

export function decideRoute({ auth, hasLibrary, path }: GuardInput): Decision {
  if (auth === 'loading') return { kind: 'wait' };
  if (ALWAYS_OPEN.has(path)) return { kind: 'allow' };

  if (auth === 'out') {
    return GUEST_ONLY.has(path) ? { kind: 'allow' } : { kind: 'redirect', to: LOGIN_PATH };
  }

  if (GUEST_ONLY.has(path)) return { kind: 'redirect', to: HOME_PATH };
  // Never bounce the user out of onboarding: the first added game makes the library non-empty.
  if (path === ONBOARDING_PATH) return { kind: 'allow' };
  if (hasLibrary === undefined) return { kind: 'wait' };
  return hasLibrary ? { kind: 'allow' } : { kind: 'redirect', to: ONBOARDING_PATH };
}
