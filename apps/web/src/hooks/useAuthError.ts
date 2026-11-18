import { useSearchParams } from 'react-router';
import { socialErrorMessage, steamErrorMessage } from '@perch/core/browser';

/** Readable text for `?steamError=<code>` or better-auth's `?error=<code>` on the page, or null. */
export function useAuthError(): string | null {
  const [params] = useSearchParams();
  return steamErrorMessage(params.get('steamError')) ?? socialErrorMessage(params.get('error'));
}
