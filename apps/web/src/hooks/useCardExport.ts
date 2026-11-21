import { useCallback, useState, type RefObject } from 'react';
import { toPng } from 'html-to-image';
import { cardFilename, exportCardPng, type ExportRender } from '@/lib/tasteCard';

export type CardExport = {
  pending: boolean;
  error: string | null;
  /** True when the last download had to leave the cover images out. */
  withoutCovers: boolean;
  download: () => Promise<void>;
};

const render: ExportRender = (node, options) => toPng(node, options);

/** Downloads the card in `ref` as a PNG named after `label`. */
export function useCardExport(
  ref: RefObject<HTMLElement | null>,
  label: string | null,
): CardExport {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [withoutCovers, setWithoutCovers] = useState(false);

  const download = useCallback(async () => {
    const node = ref.current;
    if (!node) return;
    setPending(true);
    setError(null);
    setWithoutCovers(false);
    try {
      const out = await exportCardPng(node, render);
      setWithoutCovers(!out.withCovers);
      const a = document.createElement('a');
      a.href = out.dataUrl;
      a.download = cardFilename(label);
      a.click();
    } catch {
      setError('Could not make the image. Try again.');
    } finally {
      setPending(false);
    }
  }, [ref, label]);

  return { pending, error, withoutCovers, download };
}
