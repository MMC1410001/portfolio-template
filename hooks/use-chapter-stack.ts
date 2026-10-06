'use client';
/**
 * Publishes each `.chapter`'s height as `--chapter-h` for the stacked-panel CSS.
 *
 * A chapter sticks at `top: min(0px, 100svh - height)`: one taller than the
 * viewport scrolls normally until its bottom meets the bottom of the screen,
 * and only then holds while the next chapter slides over it. CSS cannot name
 * an element's own height inside `top`, so this writes it. It is a DOM write
 * through a ref, not state, so a `<details>` opening and growing a chapter
 * re-renders nothing.
 */
import { useEffect, type RefObject } from 'react';

export function useChapterStack(root: RefObject<HTMLElement | null>, enabled: boolean): void {
  useEffect(() => {
    const el = root.current;
    if (!el || !enabled || typeof ResizeObserver === 'undefined') return;
    const chapters = [...el.querySelectorAll<HTMLElement>('.chapter')];
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const target = entry.target as HTMLElement;
        const height = entry.borderBoxSize?.[0]?.blockSize ?? target.offsetHeight;
        target.style.setProperty('--chapter-h', `${Math.ceil(height)}px`);
      }
    });
    for (const chapter of chapters) observer.observe(chapter);
    return () => {
      observer.disconnect();
      for (const chapter of chapters) chapter.style.removeProperty('--chapter-h');
    };
  }, [root, enabled]);
}

/**
 * Where `el` sits in the document flow, as a `scrollTo` target.
 *
 * A browser resolves an in-page `#anchor` from where the element is *painted*,
 * and inside a stuck chapter that is not where it lives: a jump from #contact
 * back up to #work would land on the stuck copy's offset. Unsticking for one
 * synchronous layout read gives the flow position, and since `position` on a
 * sticky box never changes the flow, removing the class again moves nothing.
 */
export function flowScrollTop(root: HTMLElement, el: HTMLElement): number {
  root.classList.add('unstick');
  const top = el.getBoundingClientRect().top + window.scrollY;
  root.classList.remove('unstick');
  const pad = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
  const margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
  return Math.max(0, top - pad - margin);
}
