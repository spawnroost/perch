/** The slice of `HTMLImageElement` that preloading touches (so tests can supply a fake). */
export type PreloadImage = {
  onload: ((ev: Event) => void) | null;
  onerror: ((ev: Event) => void) | null;
  src: string;
  readonly complete: boolean;
};

/**
 * Starts loading `url` and calls `onDone` once, when it has loaded or failed (a failure still counts,
 * so callers never wait forever). Returns a cancel function: after it runs `onDone` never fires and
 * the download is abandoned.
 */
export function preloadImage(
  url: string,
  onDone: () => void,
  make: () => PreloadImage = () => new Image(),
): () => void {
  const img = make();
  let live = true;
  const done = () => {
    if (!live) return;
    live = false;
    onDone();
  };
  img.onload = done;
  img.onerror = done;
  img.src = url;
  if (img.complete) done();
  return () => {
    live = false;
    img.onload = null;
    img.onerror = null;
    img.src = '';
  };
}
