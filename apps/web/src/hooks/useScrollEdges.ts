import { useCallback, useEffect, useState, type RefObject } from 'react';
import { edgeFadeState, type EdgeFades } from '@/lib/shelf';

/** Tracks which edges of a horizontally scrollable element have hidden content. */
export function useScrollEdges(ref: RefObject<HTMLElement | null>): EdgeFades {
  const [edges, setEdges] = useState<EdgeFades>({ start: false, end: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const next = edgeFadeState(el);
    setEdges((prev) => (prev.start === next.start && prev.end === next.end ? prev : next));
  }, [ref]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    for (const child of Array.from(el.children)) observer.observe(child);
    const mutations = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of Array.from(record.removedNodes)) {
          if (node instanceof Element) observer.unobserve(node);
        }
        for (const node of Array.from(record.addedNodes)) {
          if (node instanceof Element) observer.observe(node);
        }
      }
      measure();
    });
    mutations.observe(el, { childList: true });
    return () => {
      el.removeEventListener('scroll', measure);
      observer.disconnect();
      mutations.disconnect();
    };
  }, [ref, measure]);

  return edges;
}
