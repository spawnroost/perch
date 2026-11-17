import { useEffect, useState } from 'react';

/**
 * The url once the browser has it (null until then), and the previous url while the next one loads,
 * so a swap never dips through an empty frame. A failed load still resolves, so the caller can show
 * its fallback instead of waiting forever.
 */
export function useLoadedImage(url: string | null | undefined): string | null {
  const [loaded, setLoaded] = useState<string | null>(null);
  useEffect(() => {
    if (!url) return;
    const img = new Image();
    let live = true;
    const done = () => {
      if (live) setLoaded(url);
    };
    img.onload = done;
    img.onerror = done;
    img.src = url;
    if (img.complete) done();
    return () => {
      live = false;
      img.onload = null;
      img.onerror = null;
    };
  }, [url]);
  return url ? loaded : null;
}
