import { useSearchParams } from 'react-router';
import { steamErrorMessage } from '@perch/core';

/** Readable text for `?steamError=<code>` on the page, or null. */
export function useSteamError(): string | null {
  const [params] = useSearchParams();
  return steamErrorMessage(params.get('steamError'));
}
