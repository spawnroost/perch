import { useEffect, useState } from 'react';
import { preloadImage } from '@/lib/preloadImage';

/**
 * The url once the browser has it (null until then), and the previous url while the next one loads,
 * so a swap never dips through an empty frame. A failed load still resolves, so the caller can show
 * its fallback instead of waiting forever.
 */
export function useLoadedImage(url: string | null | undefined): string | null {
  const [loaded, setLoaded] = useState<string | null>(null);
  useEffect(() => {
    if (!url) return;
    return preloadImage(url, () => setLoaded(url));
  }, [url]);
  return url ? loaded : null;
}
