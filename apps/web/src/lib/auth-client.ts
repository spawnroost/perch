import { createAuthClient } from 'better-auth/react';

/** Same-origin client: talks to `/api/auth/*` (Vite proxies it in dev). */
export const authClient = createAuthClient();

interface AuthResult {
  error?: { message?: string } | null;
}

/** Turn better-auth's `{ data, error }` result into a thrown Error with a readable message. */
export function unwrapAuth(result: AuthResult): void {
  if (result.error) throw new Error(result.error.message || 'Something went wrong. Try again.');
}

/** Absolute URL on this origin: better-auth redirects from the API origin after email links. */
export const appUrl = (path: string) => `${window.location.origin}${path}`;
