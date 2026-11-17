import { describe, expect, it, vi } from 'vitest';
import { preloadImage, type PreloadImage } from '@/lib/preloadImage';

class FakeImage implements PreloadImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src = '';
  complete = false;
}

function start(url = 'a.jpg') {
  const img = new FakeImage();
  const onDone = vi.fn();
  const cancel = preloadImage(url, onDone, () => img);
  return { img, onDone, cancel };
}

describe('preloadImage', () => {
  it('sets the src and reports once when the image loads', () => {
    const { img, onDone } = start();
    expect(img.src).toBe('a.jpg');
    expect(onDone).not.toHaveBeenCalled();
    img.onload?.();
    img.onload?.();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('counts a failed load as done', () => {
    const { img, onDone } = start();
    img.onerror?.();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('reports immediately for an already-cached image', () => {
    const img = new FakeImage();
    Object.defineProperty(img, 'complete', { get: () => img.src !== '' });
    const onDone = vi.fn();
    preloadImage('a.jpg', onDone, () => img);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('never reports after cancel, and abandons the download', () => {
    const { img, onDone, cancel } = start();
    const onload = img.onload;
    cancel();
    onload?.();
    expect(onDone).not.toHaveBeenCalled();
    expect(img.onload).toBeNull();
    expect(img.onerror).toBeNull();
    expect(img.src).toBe('');
  });

  it('a superseded url cannot report: only the latest preload resolves', () => {
    const first = start('a.jpg');
    first.cancel();
    const second = start('b.jpg');
    first.img.onload?.();
    second.img.onload?.();
    expect(first.onDone).not.toHaveBeenCalled();
    expect(second.onDone).toHaveBeenCalledTimes(1);
  });
});
